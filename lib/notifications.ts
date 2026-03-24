import { sql } from "@vercel/postgres";
import { Notification, NotificationType } from "@/types";

// === Row Mapper ===

function rowToNotification(row: Record<string, unknown>): Notification {
  return {
    id: row.id as number,
    recipientId: row.recipient_id as number,
    ticketId: (row.ticket_id as number) ?? null,
    type: row.type as NotificationType,
    title: row.title as string,
    body: (row.body as string) ?? "",
    link: (row.link as string) ?? "",
    isRead: row.is_read as boolean,
    createdAt: (row.created_at as Date)?.toISOString(),
  };
}

// === Create Notification ===

export async function createNotification(
  recipientId: number,
  ticketId: number | null,
  type: NotificationType,
  title: string,
  body: string,
  link: string
): Promise<Notification | null> {
  try {
    const { rows } = await sql`
      INSERT INTO notifications (recipient_id, ticket_id, type, title, body, link)
      VALUES (${recipientId}, ${ticketId}, ${type}, ${title}, ${body}, ${link})
      RETURNING *
    `;
    return rowToNotification(rows[0]);
  } catch (err) {
    console.error("[notifications] Failed to create notification:", err);
    return null;
  }
}

export async function createBulkNotifications(
  recipientIds: number[],
  ticketId: number | null,
  type: NotificationType,
  title: string,
  body: string,
  link: string
): Promise<void> {
  // Deduplicate and filter
  const unique = [...new Set(recipientIds.filter((id) => id != null))];
  for (const recipientId of unique) {
    await createNotification(recipientId, ticketId, type, title, body, link);
  }
}

// === Query Notifications ===

export async function getUnreadCount(recipientId: number): Promise<number> {
  const { rows } = await sql`
    SELECT COUNT(*)::int AS count FROM notifications
    WHERE recipient_id = ${recipientId} AND is_read = false
  `;
  return rows[0].count as number;
}

export async function getNotifications(
  recipientId: number,
  limit = 30,
  offset = 0
): Promise<Notification[]> {
  const { rows } = await sql`
    SELECT * FROM notifications
    WHERE recipient_id = ${recipientId}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return rows.map(rowToNotification);
}

// === Mark Read ===

export async function markRead(notificationId: number): Promise<void> {
  await sql`
    UPDATE notifications SET is_read = true WHERE id = ${notificationId}
  `;
}

export async function markAllRead(recipientId: number): Promise<void> {
  await sql`
    UPDATE notifications SET is_read = true
    WHERE recipient_id = ${recipientId} AND is_read = false
  `;
}

// === Dedup Check (for cron-driven notifications) ===

export async function hasRecentNotification(
  recipientId: number,
  type: NotificationType,
  ticketId: number | null,
  withinHours = 24
): Promise<boolean> {
  const { rows } = await sql`
    SELECT 1 FROM notifications
    WHERE recipient_id = ${recipientId}
      AND type = ${type}
      AND ticket_id IS NOT DISTINCT FROM ${ticketId}
      AND created_at > NOW() - INTERVAL '1 hour' * ${withinHours}
    LIMIT 1
  `;
  return rows.length > 0;
}

// === Cleanup ===

export async function deleteOldNotifications(daysOld = 90): Promise<number> {
  const { rowCount } = await sql`
    DELETE FROM notifications
    WHERE is_read = true AND created_at < NOW() - INTERVAL '1 day' * ${daysOld}
  `;
  return rowCount ?? 0;
}
