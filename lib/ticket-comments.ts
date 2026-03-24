import { sql } from "@vercel/postgres";
import { TicketComment } from "@/types";
import { logActivity } from "@/lib/ticket-activity";
import { notifyComment } from "@/lib/notification-triggers";

// === Row Mapper ===

function rowToComment(row: Record<string, unknown>): TicketComment {
  return {
    id: row.id as number,
    ticketId: row.ticket_id as number,
    authorType: row.author_type as "team" | "client",
    authorId: (row.author_id as number) ?? null,
    authorName: row.author_name as string,
    authorEmail: (row.author_email as string) ?? "",
    content: row.content as string,
    createdAt: (row.created_at as Date)?.toISOString(),
    updatedAt: (row.updated_at as Date)?.toISOString(),
  };
}

// === Query Comments ===

export async function getComments(
  ticketId: number,
  limit = 100,
  offset = 0
): Promise<TicketComment[]> {
  const { rows } = await sql`
    SELECT * FROM ticket_comments
    WHERE ticket_id = ${ticketId}
    ORDER BY created_at ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return rows.map(rowToComment);
}

// === Add Comment ===

export async function addComment(
  ticketId: number,
  authorId: number | null,
  authorName: string,
  authorEmail: string,
  content: string,
  authorType: "team" | "client" = "team"
): Promise<TicketComment> {
  const { rows } = await sql`
    INSERT INTO ticket_comments (
      ticket_id, author_type, author_id, author_name, author_email, content
    )
    VALUES (
      ${ticketId}, ${authorType}, ${authorId}, ${authorName}, ${authorEmail}, ${content}
    )
    RETURNING *
  `;

  await logActivity(ticketId, authorId, authorName, "comment_added");
  notifyComment(ticketId, authorId, authorName);

  return rowToComment(rows[0]);
}

// === Update Comment (own only) ===

export async function updateComment(
  commentId: number,
  content: string,
  authorId: number
): Promise<TicketComment | null> {
  const { rows } = await sql`
    UPDATE ticket_comments
    SET content = ${content}, updated_at = NOW()
    WHERE id = ${commentId} AND author_id = ${authorId}
    RETURNING *
  `;
  return rows.length > 0 ? rowToComment(rows[0]) : null;
}

// === Delete Comment (own only) ===

export async function deleteComment(
  commentId: number,
  authorId: number
): Promise<boolean> {
  const { rowCount } = await sql`
    DELETE FROM ticket_comments
    WHERE id = ${commentId} AND author_id = ${authorId}
  `;
  return (rowCount ?? 0) > 0;
}
