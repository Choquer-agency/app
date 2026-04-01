import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { TicketComment } from "@/types";
import { logActivity } from "@/lib/ticket-activity";
import { notifyComment } from "@/lib/notification-triggers";

// === Doc Mapper ===

function docToComment(doc: any): TicketComment {
  return {
    id: doc._id,
    ticketId: doc.ticketId,
    authorType: doc.authorType ?? "team",
    authorId: doc.authorId ?? null,
    authorName: doc.authorName ?? "",
    authorEmail: doc.authorEmail ?? "",
    content: doc.content ?? "",
    createdAt: doc._creationTime
      ? new Date(doc._creationTime).toISOString()
      : "",
    updatedAt: doc._creationTime
      ? new Date(doc._creationTime).toISOString()
      : "",
  };
}

// === Query Comments ===

export async function getComments(
  ticketId: number | string,
  limit = 100,
  offset = 0
): Promise<TicketComment[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.ticketComments.listByTicket, {
    ticketId: ticketId as any,
    limit,
  });
  const sliced = offset > 0 ? docs.slice(offset) : docs;
  return sliced.map(docToComment);
}

// === Add Comment ===

export async function addComment(
  ticketId: number | string,
  authorId: number | string | null,
  authorName: string,
  authorEmail: string,
  content: string,
  authorType: "team" | "client" = "team"
): Promise<TicketComment> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.ticketComments.create, {
    ticketId: ticketId as any,
    authorType,
    authorId: authorId ? (authorId as any) : undefined,
    authorName,
    authorEmail,
    content,
  });

  await logActivity(ticketId, authorId, authorName, "comment_added");
  notifyComment(ticketId, authorId, authorName);

  return docToComment(doc);
}

// === Update Comment (own only) ===

export async function updateComment(
  commentId: number | string,
  content: string,
  authorId: number | string
): Promise<TicketComment | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.ticketComments.update, {
    id: commentId as any,
    content,
  });
  if (!doc) return null;
  return docToComment(doc);
}

// === Get Single Comment ===

export async function getComment(commentId: number | string): Promise<TicketComment | null> {
  const convex = getConvexClient();
  try {
    const doc = await convex.query(api.ticketComments.getById, {
      id: commentId as any,
    });
    if (!doc) return null;
    return docToComment(doc);
  } catch {
    return null;
  }
}

// === Delete Comment ===

export async function deleteComment(
  commentId: number | string,
  authorId: number | string
): Promise<boolean> {
  const convex = getConvexClient();
  try {
    await convex.mutation(api.ticketComments.remove, {
      id: commentId as any,
    });
    return true;
  } catch {
    return false;
  }
}
