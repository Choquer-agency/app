/**
 * CRUD operations for the slack_conversations table.
 * Tracks multi-turn conversation state for the Slack assistant.
 */

import { sql } from "@vercel/postgres";
import { ConversationState, SlackIntent } from "./types";

function rowToConversation(row: Record<string, unknown>): ConversationState {
  return {
    id: row.id as number,
    threadTs: row.thread_ts as string,
    channelId: row.channel_id as string,
    intent: row.intent as SlackIntent,
    state: row.state as string,
    data: (row.data as Record<string, unknown>) || {},
    ownerId: row.owner_id as number,
    createdAt: (row.created_at as Date)?.toISOString(),
    updatedAt: (row.updated_at as Date)?.toISOString(),
    expiresAt: (row.expires_at as Date)?.toISOString(),
  };
}

export async function getConversation(threadTs: string): Promise<ConversationState | null> {
  const { rows } = await sql`
    SELECT * FROM slack_conversations
    WHERE thread_ts = ${threadTs} AND expires_at > NOW()
  `;
  if (rows.length === 0) return null;
  return rowToConversation(rows[0]);
}

export async function createConversation(data: {
  threadTs: string;
  channelId: string;
  intent: SlackIntent;
  state: string;
  data: Record<string, unknown>;
  ownerId: number;
}): Promise<ConversationState> {
  const jsonData = JSON.stringify(data.data);
  const { rows } = await sql`
    INSERT INTO slack_conversations (thread_ts, channel_id, intent, state, data, owner_id)
    VALUES (${data.threadTs}, ${data.channelId}, ${data.intent}, ${data.state}, ${jsonData}::jsonb, ${data.ownerId})
    RETURNING *
  `;
  return rowToConversation(rows[0]);
}

export async function updateConversation(
  threadTs: string,
  updates: { state?: string; data?: Record<string, unknown> }
): Promise<void> {
  if (updates.state && updates.data) {
    const jsonData = JSON.stringify(updates.data);
    await sql`
      UPDATE slack_conversations
      SET state = ${updates.state}, data = ${jsonData}::jsonb, updated_at = NOW()
      WHERE thread_ts = ${threadTs}
    `;
  } else if (updates.state) {
    await sql`
      UPDATE slack_conversations
      SET state = ${updates.state}, updated_at = NOW()
      WHERE thread_ts = ${threadTs}
    `;
  } else if (updates.data) {
    const jsonData = JSON.stringify(updates.data);
    await sql`
      UPDATE slack_conversations
      SET data = ${jsonData}::jsonb, updated_at = NOW()
      WHERE thread_ts = ${threadTs}
    `;
  }
}

export async function cleanExpiredConversations(): Promise<number> {
  const { rowCount } = await sql`
    DELETE FROM slack_conversations WHERE expires_at < NOW()
  `;
  return rowCount ?? 0;
}
