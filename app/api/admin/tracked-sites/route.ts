import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { hasPermission, validateRoleLevel } from "@/lib/permissions";
import { randomUUID } from "crypto";

function checkAccess(request: NextRequest): boolean {
  const session = getSession(request);
  if (!session) return false;
  const role = validateRoleLevel(session.roleLevel);
  return hasPermission(role, "traffic:view");
}

function checkManageAccess(request: NextRequest): boolean {
  const session = getSession(request);
  if (!session) return false;
  const role = validateRoleLevel(session.roleLevel);
  return hasPermission(role, "traffic:manage");
}

export async function GET(request: NextRequest) {
  if (!checkAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const convex = getConvexClient();
    const sites = await convex.query(api.trackedSites.list, {});
    return NextResponse.json(sites);
  } catch (error) {
    console.error("Failed to fetch tracked sites:", error);
    return NextResponse.json({ error: "Failed to fetch tracked sites" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!checkManageAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (!body.name?.trim() || !body.domain?.trim()) {
      return NextResponse.json({ error: "Name and domain are required" }, { status: 400 });
    }

    const convex = getConvexClient();
    const site = await convex.mutation(api.trackedSites.create, {
      name: body.name.trim(),
      domain: body.domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""),
      siteKey: randomUUID(),
      clientId: body.clientId || undefined,
      excludedIps: body.excludedIps || [],
      consentMode: body.consentMode || false,
    });

    return NextResponse.json(site, { status: 201 });
  } catch (error) {
    console.error("Failed to create tracked site:", error);
    return NextResponse.json({ error: "Failed to create tracked site" }, { status: 500 });
  }
}
