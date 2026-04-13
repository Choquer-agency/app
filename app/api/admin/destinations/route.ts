import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { encryptCredentials } from "@/lib/credentials-crypto";
import { getDestination } from "@/lib/destinations/registry";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.roleLevel, "connections:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const convex = getConvexClient();
  const rows = await convex.query(api.destinations.list, {});
  // Never expose encryptedConfig / configIv to clients.
  const safe = (rows as any[]).map((r) => ({
    _id: r._id,
    type: r.type,
    name: r.name,
    connectionId: r.connectionId,
    status: r.status,
    lastTestedAt: r.lastTestedAt,
    lastError: r.lastError,
    createdById: r.createdById,
    _creationTime: r._creationTime,
  }));
  return NextResponse.json({ destinations: safe });
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.roleLevel, "connections:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { type, name, connectionId, config } = body ?? {};
  if (!type || !name || !connectionId) {
    return NextResponse.json({ error: "type, name, connectionId required" }, { status: 400 });
  }

  const driver = getDestination(type);
  const validated = driver.validate(config);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const { ciphertext, iv } = encryptCredentials(JSON.stringify(validated.config));
  const convex = getConvexClient();
  const id = await convex.mutation(api.destinations.create, {
    type,
    name,
    createdById: session.teamMemberId as any,
    encryptedConfig: ciphertext,
    configIv: iv,
    connectionId: connectionId as any,
  });

  return NextResponse.json({ id }, { status: 201 });
}
