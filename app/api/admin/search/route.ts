import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getSession } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim();

    if (!q) {
      return NextResponse.json({ tickets: [], clients: [], projects: [], members: [], comments: [], notes: [] });
    }

    const ilike = `%${q}%`;

    const [ticketResult, clientResult, projectResult, memberResult, commentResult, noteResult] = await Promise.all([
      // Tickets: ILIKE on ticket_number, title, description
      sql`
        SELECT t.id, t.ticket_number AS "ticketNumber", t.title, t.status, t.priority,
               c.name AS "clientName"
        FROM tickets t
        LEFT JOIN clients c ON c.id = t.client_id
        WHERE t.archived = false
          AND (
            t.ticket_number ILIKE ${ilike}
            OR t.title ILIKE ${ilike}
            OR t.description::text ILIKE ${ilike}
          )
        ORDER BY
          CASE WHEN t.ticket_number ILIKE ${ilike} THEN 0
               WHEN t.title ILIKE ${ilike} THEN 1
               ELSE 2 END,
          t.updated_at DESC
        LIMIT 8
      `,
      // Clients: ILIKE on name
      sql`
        SELECT id, name, client_status AS "clientStatus"
        FROM clients
        WHERE name ILIKE ${ilike}
        ORDER BY name
        LIMIT 5
      `,
      // Projects: ILIKE on name
      sql`
        SELECT p.id, p.name, c.name AS "clientName"
        FROM projects p
        LEFT JOIN clients c ON c.id = p.client_id
        WHERE p.archived = false AND p.is_template = false AND p.name ILIKE ${ilike}
        ORDER BY p.name
        LIMIT 5
      `,
      // Team members: ILIKE on name
      sql`
        SELECT id, name, role
        FROM team_members
        WHERE active = true AND name ILIKE ${ilike}
        ORDER BY name
        LIMIT 5
      `,
      // Comments: search within Tiptap JSON text content
      sql`
        SELECT tc.id, tc.ticket_id AS "ticketId", tc.content, tc.author_name AS "authorName",
               t.ticket_number AS "ticketNumber", t.title AS "ticketTitle"
        FROM ticket_comments tc
        JOIN tickets t ON t.id = tc.ticket_id
        WHERE t.archived = false AND tc.content::text ILIKE ${ilike}
        ORDER BY tc.created_at DESC
        LIMIT 5
      `,
      // Client notes: extract text from JSON content and search
      sql`
        SELECT cn.id, cn.client_id AS "clientId", cn.content, cn.author,
               c.name AS "clientName"
        FROM client_notes cn
        JOIN clients c ON c.id = cn.client_id
        WHERE cn.content::text ILIKE ${ilike}
        ORDER BY cn.created_at DESC
        LIMIT 5
      `,
    ]);

    return NextResponse.json({
      tickets: ticketResult.rows,
      clients: clientResult.rows,
      projects: projectResult.rows,
      members: memberResult.rows,
      comments: commentResult.rows,
      notes: noteResult.rows,
    });
  } catch (error) {
    console.error("Search failed:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
