import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

// GET /api/admin/projects/[id]/role-assignments — get all ticket->role assignments for a project
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const convex = getConvexClient();
  const assignments = await convex.query(api.ticketTemplateRoleAssignments.listByProject, {
    projectId: id as any,
  });

  const rows = (assignments as any[]).map((a: any) => ({
    ticketId: a.ticketId,
    templateRoleId: a.templateRoleId,
  }));

  return NextResponse.json(rows);
}
