import { sql } from "@vercel/postgres";
import { ClientNote } from "@/types";

function rowToNote(row: Record<string, unknown>): ClientNote {
  return {
    id: row.id as number,
    clientId: row.client_id as number,
    author: (row.author as string) || "Admin",
    noteType: (row.note_type as ClientNote["noteType"]) || "note",
    content: (row.content as string) || "",
    metadata: (row.metadata as Record<string, unknown>) || {},
    createdAt: (row.created_at as Date)?.toISOString(),
  };
}

export async function getClientNotes(
  clientId: number,
  limit = 50,
  offset = 0
): Promise<ClientNote[]> {
  const { rows } = await sql`
    SELECT * FROM client_notes
    WHERE client_id = ${clientId}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return rows.map(rowToNote);
}

export async function addNote(data: {
  clientId: number;
  author?: string;
  noteType?: ClientNote["noteType"];
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<ClientNote> {
  const meta = JSON.stringify(data.metadata || {});
  const { rows } = await sql`
    INSERT INTO client_notes (client_id, author, note_type, content, metadata)
    VALUES (
      ${data.clientId},
      ${data.author || "Admin"},
      ${data.noteType || "note"},
      ${data.content},
      ${meta}::jsonb
    )
    RETURNING *
  `;
  return rowToNote(rows[0]);
}

export async function deleteNote(id: number): Promise<boolean> {
  const { rowCount } = await sql`
    DELETE FROM client_notes WHERE id = ${id}
  `;
  return (rowCount ?? 0) > 0;
}
