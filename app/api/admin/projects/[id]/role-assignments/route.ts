import { sql } from "@vercel/postgres";
import { NextRequest, NextResponse } from "next/server";

// GET /api/admin/projects/[id]/role-assignments — get all ticket→role assignments for a project
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);

  const { rows } = await sql`
    SELECT tra.ticket_id AS "ticketId", tra.template_role_id AS "templateRoleId"
    FROM ticket_template_role_assignments tra
    JOIN tickets t ON t.id = tra.ticket_id
    WHERE t.project_id = ${projectId}
    ORDER BY tra.ticket_id, tra.template_role_id
  `;

  return NextResponse.json(rows);
}
