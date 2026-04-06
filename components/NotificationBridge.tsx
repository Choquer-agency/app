"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const BATCH_WINDOW_MS = 300;
const STAGGER_DELAY_MS = 200;
const SUMMARY_THRESHOLD = 4;
const SEEN_IDS_CLEANUP = 1000;

interface NotificationDoc {
  _id: string;
  _creationTime: number;
  title: string;
  body?: string;
  link?: string;
  type: string;
  isRead: boolean;
}

export default function NotificationBridge({
  teamMemberId,
}: {
  teamMemberId: string;
}) {
  const notifications = useQuery(api.notifications.listByRecipient, {
    recipientId: teamMemberId as Id<"teamMembers">,
    limit: 30,
  });

  const unreadCount = useQuery(api.notifications.getUnreadCount, {
    recipientId: teamMemberId as Id<"teamMembers">,
  });

  const seenIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const batchQueueRef = useRef<NotificationDoc[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const nativeShownRef = useRef<Set<string>>(new Set());

  const isTauri = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return typeof window !== "undefined" && !!(window as any).__TAURI__;
  }, []);

  const sendNativeNotification = useCallback(
    async (title: string, body?: string) => {
      if (!isTauri()) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (window as any).__TAURI__.core.invoke("show_notification", {
          title,
          body: body || undefined,
        });
      } catch {
        // Silent degradation — in-app bell still works
      }
    },
    [isTauri]
  );

  const processBatch = useCallback(async () => {
    if (!mountedRef.current) return;

    const queue = [...batchQueueRef.current];
    batchQueueRef.current = [];
    batchTimerRef.current = null;

    if (queue.length === 0) return;

    if (queue.length >= SUMMARY_THRESHOLD) {
      // 4+ notifications: single summary to prevent spam
      await sendNativeNotification(
        "Choquer.Agency",
        `You have ${queue.length} new notifications`
      );
    } else {
      // 1-3 notifications: show each individually with stagger
      for (let i = 0; i < queue.length; i++) {
        if (!mountedRef.current) return;
        const n = queue[i];

        if (nativeShownRef.current.has(n._id)) continue;
        nativeShownRef.current.add(n._id);

        await sendNativeNotification(n.title, n.body);

        if (i < queue.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, STAGGER_DELAY_MS));
        }
      }
    }

    // Trigger the in-app NotificationBell to refresh
    window.dispatchEvent(new CustomEvent("notificationChange"));
  }, [sendNativeNotification]);

  const enqueueNotification = useCallback(
    (notification: NotificationDoc) => {
      batchQueueRef.current.push(notification);

      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
      }
      batchTimerRef.current = setTimeout(processBatch, BATCH_WINDOW_MS);
    },
    [processBatch]
  );

  // Diff notifications to detect new ones
  useEffect(() => {
    if (!notifications) return;

    if (!initializedRef.current) {
      // First load: capture all existing IDs as "already seen"
      for (const n of notifications) {
        seenIdsRef.current.add(n._id);
      }
      initializedRef.current = true;
      return;
    }

    // Subsequent updates: find new notification IDs
    for (const n of notifications) {
      if (!seenIdsRef.current.has(n._id) && !n.isRead) {
        seenIdsRef.current.add(n._id);
        enqueueNotification(n as unknown as NotificationDoc);
      }
    }

    // Prevent unbounded Set growth during long sessions
    if (seenIdsRef.current.size > SEEN_IDS_CLEANUP) {
      const currentIds = new Set(notifications.map((n) => n._id));
      seenIdsRef.current = currentIds;
    }
  }, [notifications, enqueueNotification]);

  // Real-time dock badge sync via Phase 2's update_dock_badge command
  useEffect(() => {
    if (!isTauri() || unreadCount === undefined) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI__.core
      .invoke("update_dock_badge", { count: unreadCount })
      .catch(() => {});
  }, [unreadCount, isTauri]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
      }
    };
  }, []);

  return null;
}
