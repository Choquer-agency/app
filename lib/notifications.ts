import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { Notification, NotificationType } from "@/types";
import {
  shouldNotify,
  clearPrefsCache,
  type NotificationMetadata,
} from "@/lib/notification-preferences";

// === Doc Mapper ===

function docToNotification(doc: any): Notification {
  return {
    id: doc._id,
    recipientId: doc.recipientId,
    ticketId: doc.ticketId ?? null,
    type: doc.type as NotificationType,
    title: doc.title ?? "",
    body: doc.body ?? "",
    link: doc.link ?? "",
    isRead: doc.isRead ?? false,
    createdAt: doc._creationTime
      ? new Date(doc._creationTime).toISOString()
      : "",
  };
}

// === Create Notification ===

export async function createNotification(
  recipientId: number | string,
  ticketId: number | string | null,
  type: NotificationType,
  title: string,
  body: string,
  link: string,
  metadata?: NotificationMetadata,
  roleLevel?: string
): Promise<Notification | null> {
  try {
    const convex = getConvexClient();

    // Resolve role level so shouldNotify() applies role-aware defaults.
    let effectiveRole = roleLevel;
    if (!effectiveRole) {
      try {
        const member = await convex.query(api.teamMembers.getById, {
          id: recipientId as any,
        });
        effectiveRole = (member as any)?.roleLevel;
      } catch {
        // Non-fatal — shouldNotify falls back to employee defaults
      }
    }

    const allowed = await shouldNotify(String(recipientId), type, metadata, effectiveRole);
    if (!allowed) return null;

    const doc = await convex.mutation(api.notifications.create, {
      recipientId: recipientId as any,
      ticketId: ticketId ? (ticketId as any) : undefined,
      type,
      title,
      body,
      link,
    });
    return docToNotification(doc);
  } catch (err) {
    console.error("[notifications] Failed to create notification:", err);
    return null;
  }
}

export async function createBulkNotifications(
  recipientIds: (number | string)[],
  ticketId: number | string | null,
  type: NotificationType,
  title: string,
  body: string,
  link: string,
  metadata?: NotificationMetadata
): Promise<void> {
  clearPrefsCache();
  const unique = [...new Set(recipientIds.filter((id) => id != null))];
  if (unique.length === 0) return;

  // Batch-fetch roleLevel for all recipients so shouldNotify() uses role-aware defaults.
  // Without this, owner/c_suite recipients silently inherit employee defaults.
  let roleMap = new Map<string, string>();
  try {
    const convex = getConvexClient();
    const members = await convex.query(api.teamMembers.list, { activeOnly: false });
    for (const m of members as any[]) {
      if (m._id && m.roleLevel) {
        roleMap.set(String(m._id), m.roleLevel as string);
      }
    }
  } catch (err) {
    console.error("[notifications] Failed to fetch team roles for bulk fan-out:", err);
  }

  for (const recipientId of unique) {
    const roleLevel = roleMap.get(String(recipientId));
    await createNotification(recipientId, ticketId, type, title, body, link, metadata, roleLevel);
  }
}

// === Query Notifications ===

export async function getUnreadCount(recipientId: number | string): Promise<number> {
  const convex = getConvexClient();
  return await convex.query(api.notifications.getUnreadCount, {
    recipientId: recipientId as any,
  });
}

export async function getNotifications(
  recipientId: number | string,
  limit = 30,
  offset = 0
): Promise<Notification[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.notifications.listByRecipient, {
    recipientId: recipientId as any,
    limit,
  });
  const sliced = offset > 0 ? docs.slice(offset) : docs;
  return sliced.map(docToNotification);
}

// === Mark Read ===

export async function markRead(notificationId: number | string): Promise<void> {
  const convex = getConvexClient();
  await convex.mutation(api.notifications.markRead, {
    id: notificationId as any,
  });
}

export async function markAllRead(recipientId: number | string): Promise<void> {
  const convex = getConvexClient();
  await convex.mutation(api.notifications.markAllRead, {
    recipientId: recipientId as any,
  });
}

// === Auto-Dismiss Helpers ===

export async function markReadByType(recipientId: string, type: string): Promise<void> {
  const convex = getConvexClient();
  await convex.mutation(api.notifications.markReadByType, {
    recipientId: recipientId as any,
    type,
  });
}

export async function markReadByTicket(recipientId: string, ticketId: string): Promise<void> {
  const convex = getConvexClient();
  await convex.mutation(api.notifications.markReadByTicket, {
    recipientId: recipientId as any,
    ticketId: ticketId as any,
  });
}

// === Dedup Check (for cron-driven notifications) ===

export async function hasRecentNotification(
  recipientId: number | string,
  type: NotificationType,
  ticketId: number | string | null,
  withinHours = 24
): Promise<boolean> {
  const convex = getConvexClient();
  // Fetch recent notifications for this recipient and check in JS
  const docs = await convex.query(api.notifications.listByRecipient, {
    recipientId: recipientId as any,
    limit: 100,
  });

  const cutoff = Date.now() - withinHours * 60 * 60 * 1000;
  return docs.some((doc: any) => {
    if (doc.type !== type) return false;
    if (ticketId && doc.ticketId !== ticketId) return false;
    if (!ticketId && doc.ticketId) return false;
    const createdAt = doc._creationTime ?? 0;
    return createdAt > cutoff;
  });
}

export async function deleteNotification(notificationId: string): Promise<void> {
  const convex = getConvexClient();
  await convex.mutation(api.notifications.remove, {
    id: notificationId as any,
  });
}

// === Cleanup ===

export async function deleteOldNotifications(daysOld = 90): Promise<number> {
  // Would need a dedicated Convex mutation to bulk-delete old notifications.
  // Not directly supported by current Convex functions.
  return 0;
}
