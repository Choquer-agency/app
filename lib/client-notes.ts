import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { ClientNote } from "@/types";

function docToNote(doc: any): ClientNote {
  return {
    id: doc._id,
    clientId: doc.clientId,
    author: doc.author ?? "Admin",
    noteType: doc.noteType ?? "note",
    content: doc.content ?? "",
    metadata: doc.metadata ?? {},
    createdAt: doc._creationTime ? new Date(doc._creationTime).toISOString() : "",
  };
}

export async function getClientNotes(
  clientId: string,
  limit = 50,
  offset = 0
): Promise<ClientNote[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.clientNotes.listByClient, {
    clientId: clientId as any,
    limit,
  });
  return docs.map(docToNote);
}

export async function addNote(data: {
  clientId: string;
  author?: string;
  noteType?: ClientNote["noteType"];
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<ClientNote> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.clientNotes.create, {
    clientId: data.clientId as any,
    author: data.author,
    noteType: data.noteType,
    content: data.content,
    metadata: data.metadata,
  });
  return docToNote(doc);
}

export async function deleteNote(id: string): Promise<boolean> {
  const convex = getConvexClient();
  await convex.mutation(api.clientNotes.remove, { id: id as any });
  return true;
}
