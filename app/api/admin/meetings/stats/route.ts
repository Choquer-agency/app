import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

export async function GET() {
  const { rows } = await sql`
    SELECT
      tm.id,
      COUNT(CASE WHEN t.status != 'closed' AND t.archived = false THEN 1 END)::int AS "openTickets",
      COUNT(CASE WHEN t.due_date < CURRENT_DATE AND t.status != 'closed' AND t.archived = false THEN 1 END)::int AS "overdueTickets"
    FROM team_members tm
    LEFT JOIN ticket_assignees ta ON ta.team_member_id = tm.id
    LEFT JOIN tickets t ON t.id = ta.ticket_id
    WHERE tm.active = true
    GROUP BY tm.id
  `;
  return NextResponse.json(rows);
}
