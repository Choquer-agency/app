import { sql } from "@vercel/postgres";
import { TicketAttachment } from "@/types";
import { logActivity } from "@/lib/ticket-activity";

// === Row Mapper ===

function rowToAttachment(row: Record<string, unknown>): TicketAttachment {
  return {
    id: row.id as number,
    ticketId: row.ticket_id as number,
    uploadedById: (row.uploaded_by_id as number) ?? null,
    uploadedByName: (row.uploaded_by_name as string) ?? "",
    fileName: row.file_name as string,
    fileUrl: row.file_url as string,
    fileSize: row.file_size as number,
    fileType: row.file_type as string,
    createdAt: (row.created_at as Date)?.toISOString(),
  };
}

// === Query Attachments ===

export async function getAttachments(
  ticketId: number
): Promise<TicketAttachment[]> {
  const { rows } = await sql`
    SELECT * FROM ticket_attachments
    WHERE ticket_id = ${ticketId}
    ORDER BY created_at DESC
  `;
  return rows.map(rowToAttachment);
}

// === Add Attachment Record ===

export async function addAttachmentRecord(
  ticketId: number,
  uploadedById: number | null,
  uploadedByName: string,
  fileName: string,
  fileUrl: string,
  fileSize: number,
  fileType: string
): Promise<TicketAttachment> {
  const { rows } = await sql`
    INSERT INTO ticket_attachments (
      ticket_id, uploaded_by_id, uploaded_by_name,
      file_name, file_url, file_size, file_type
    )
    VALUES (
      ${ticketId}, ${uploadedById}, ${uploadedByName},
      ${fileName}, ${fileUrl}, ${fileSize}, ${fileType}
    )
    RETURNING *
  `;

  await logActivity(ticketId, uploadedById, uploadedByName, "attachment_added", {
    newValue: fileName,
  });

  return rowToAttachment(rows[0]);
}

// === Delete Attachment ===

export async function deleteAttachment(
  attachmentId: number,
  ticketId: number
): Promise<boolean> {
  // Get the record first to delete from blob storage
  const { rows } = await sql`
    SELECT file_url FROM ticket_attachments
    WHERE id = ${attachmentId} AND ticket_id = ${ticketId}
  `;

  if (rows.length === 0) return false;

  const fileUrl = rows[0].file_url as string;

  // Delete from Vercel Blob if applicable
  if (fileUrl && !fileUrl.startsWith("/uploads/") && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { del } = await import("@vercel/blob");
      await del(fileUrl);
    } catch (err) {
      console.error("Failed to delete from blob:", err);
    }
  }

  // Delete DB record
  const { rowCount } = await sql`
    DELETE FROM ticket_attachments
    WHERE id = ${attachmentId} AND ticket_id = ${ticketId}
  `;

  return (rowCount ?? 0) > 0;
}
