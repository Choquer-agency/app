import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { decryptCredentials } from "@/lib/credentials-crypto";
import { getDestination } from "@/lib/destinations/registry";
import { googleAccessTokenAccessor, notionTokenAccessor } from "@/lib/destinations/connection";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.roleLevel, "connections:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const convex = getConvexClient();
  const dest = await convex.query(api.destinations.getById, { id: id as any });
  if (!dest) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const driver = getDestination(dest.type);
  const config = JSON.parse(decryptCredentials(dest.encryptedConfig, dest.configIv));

  const result = await driver.test({
    workspace: { id: "choquer" },
    config,
    getGoogleAccessToken: googleAccessTokenAccessor(dest.connectionId),
    getNotionToken: notionTokenAccessor(dest.connectionId),
  }).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));

  await convex.mutation(api.destinations.update, {
    id: dest._id,
    status: result.ok ? "active" : "error",
    lastTestedAt: new Date().toISOString(),
    lastError: result.ok ? undefined : result.error,
  });

  return NextResponse.json(result);
}
