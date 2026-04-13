import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasMinRole } from "@/lib/permissions";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const convex = getConvexClient();
  const canSeeAll = hasMinRole(session.roleLevel, "c_suite");

  const rows = await convex.query(api.mcpAuditLog.recent, {
    limit: 100,
    teamMemberId: canSeeAll ? undefined : (session.teamMemberId as any),
  });

  return NextResponse.json({ entries: rows, canSeeAll });
}
