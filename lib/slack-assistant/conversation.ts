/**
 * CRUD operations for the slack_conversations table.
 * Tracks multi-turn conversation state for the Slack assistant.
 */

import { getConvexClient } from "../convex-server";
import { api } from "@/convex/_generated/api";
import { ConversationState, SlackIntent } from "./types";

function docToConversation(doc: any): ConversationState {
  return {
    id: doc._id,
    threadTs: doc.threadTs,
    channelId: doc.channelId,
    intent: doc.intent as SlackIntent,
    state: doc.state,
    data: doc.data || {},
    ownerId: doc.ownerId,
    createdAt: doc._creationTime ? new Date(doc._creationTime).toISOString() : "",
    updatedAt: doc.updatedAt || "",
    expiresAt: doc.expiresAt || "",
  };
}

export async function getConversation(threadTs: string): Promise<ConversationState | null> {
  const convex = getConvexClient();
  const doc = await convex.query(api.slackConversations.getByThreadTs, { threadTs });
  if (!doc) return null;
  // Check expiry client-side
  if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) return null;
  return docToConversation(doc);
}

export async function createConversation(data: {
  threadTs: string;
  channelId: string;
  intent: SlackIntent;
  state: string;
  data: Record<string, unknown>;
  ownerId: number;
}): Promise<ConversationState> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.slackConversations.create, {
    threadTs: data.threadTs,
    channelId: data.channelId,
    intent: data.intent,
    state: data.state,
    data: data.data,
    ownerId: data.ownerId as any,
  });
  return docToConversation(doc);
}

export async function updateConversation(
  threadTs: string,
  updates: { state?: string; data?: Record<string, unknown> }
): Promise<void> {
  const convex = getConvexClient();
  await convex.mutation(api.slackConversations.updateByThreadTs, {
    threadTs,
    ...(updates.state !== undefined ? { state: updates.state } : {}),
    ...(updates.data !== undefined ? { data: updates.data } : {}),
  } as any);
}

export async function cleanExpiredConversations(): Promise<number> {
  const convex = getConvexClient();
  const result = await convex.mutation(api.slackConversations.cleanExpired, {});
  return result ?? 0;
}
