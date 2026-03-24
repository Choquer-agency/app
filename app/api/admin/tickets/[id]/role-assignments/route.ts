import { sql } from "@vercel/postgres";
import { NextRequest, NextResponse } from "next/server";

// POST — add a role assignment to a ticket
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ticketId = Number(id);
  const { templateRoleId } = await req.json();

  await sql`
    INSERT INTO ticket_template_role_assignments (ticket_id, template_role_id)
    VALUES (${ticketId}, ${templateRoleId})
    ON CONFLICT (ticket_id, template_role_id) DO NOTHING
  `;

  return NextResponse.json({ ok: true });
}

// DELETE — remove a role assignment from a ticket
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ticketId = Number(id);
  const { templateRoleId } = await req.json();

  await sql`
    DELETE FROM ticket_template_role_assignments
    WHERE ticket_id = ${ticketId} AND template_role_id = ${templateRoleId}
  `;

  return NextResponse.json({ ok: true });
}
