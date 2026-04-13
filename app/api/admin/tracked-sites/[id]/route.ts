import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { hasPermission, validateRoleLevel } from "@/lib/permissions";

function checkManageAccess(request: NextRequest): boolean {
  const session = getSession(request);
  if (!session) return false;
  const role = validateRoleLevel(session.roleLevel);
  return hasPermission(role, "traffic:manage");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const convex = getConvexClient();
    const site = await convex.query(api.trackedSites.get, { id: id as any });
    if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(site);
  } catch (error) {
    console.error("Failed to fetch tracked site:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkManageAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const body = await request.json();
    const convex = getConvexClient();
    const site = await convex.mutation(api.trackedSites.update, {
      id: id as any,
      name: body.name,
      domain: body.domain,
      active: body.active,
      excludedIps: body.excludedIps,
      consentMode: body.consentMode,
    });
    return NextResponse.json(site);
  } catch (error) {
    console.error("Failed to update tracked site:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkManageAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const convex = getConvexClient();
    await convex.mutation(api.trackedSites.remove, { id: id as any });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete tracked site:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
