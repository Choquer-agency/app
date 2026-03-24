import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { TicketAttachment } from "@/types";
import { logActivity } from "@/lib/ticket-activity";

// === Doc Mapper ===

function docToAttachment(doc: any): TicketAttachment {
  return {
    id: doc._id,
    ticketId: doc.ticketId,
    uploadedById: doc.uploadedById ?? null,
    uploadedByName: doc.uploadedByName ?? "",
    fileName: doc.fileName ?? "",
    fileUrl: doc.fileUrl ?? "",
    fileSize: doc.fileSize ?? 0,
    fileType: doc.fileType ?? "",
    createdAt: doc._creationTime
      ? new Date(doc._creationTime).toISOString()
      : "",
  };
}

// === Query Attachments ===

export async function getAttachments(
  ticketId: number | string
): Promise<TicketAttachment[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.ticketAttachments.listByTicket, {
    ticketId: ticketId as any,
  });
  return docs.map(docToAttachment);
}

// === Add Attachment Record ===

export async function addAttachmentRecord(
  ticketId: number | string,
  uploadedById: number | string | null,
  uploadedByName: string,
  fileName: string,
  fileUrl: string,
  fileSize: number,
  fileType: string
): Promise<TicketAttachment> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.ticketAttachments.create, {
    ticketId: ticketId as any,
    uploadedById: uploadedById ? (uploadedById as any) : undefined,
    uploadedByName,
    fileName,
    fileUrl,
    fileSize,
    fileType,
  });

  await logActivity(ticketId, uploadedById, uploadedByName, "attachment_added", {
    newValue: fileName,
  });

  return docToAttachment(doc);
}

// === Delete Attachment ===

export async function deleteAttachment(
  attachmentId: number | string,
  ticketId: number | string
): Promise<boolean> {
  const convex = getConvexClient();
  try {
    await convex.mutation(api.ticketAttachments.remove, {
      id: attachmentId as any,
    });
    return true;
  } catch {
    return false;
  }
}
