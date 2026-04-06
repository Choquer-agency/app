"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Notification } from "@/types";
import { useSession } from "@/hooks/useSession";
import NotificationList from "./NotificationList";

export default function NotificationBell({ canDelete = false }: { canDelete?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const session = useSession();

  const recipientId = session?.teamMemberId as Id<"teamMembers"> | undefined;

  // Real-time unread count — replaces polling
  const unreadCount = useQuery(
    api.notifications.getUnreadCount,
    recipientId ? { recipientId } : "skip"
  ) ?? 0;

  // Real-time notification list — replaces fetch on open
  const rawNotifications = useQuery(
    api.notifications.listByRecipient,
    recipientId ? { recipientId, limit: 20 } : "skip"
  );

  // Map Convex docs (_id, _creationTime) to component's expected shape (id, createdAt)
  const notifications: Notification[] = useMemo(() => {
    if (!rawNotifications) return [];
    return rawNotifications.map((n) => ({
      id: n._id as string,
      recipientId: n.recipientId as string,
      ticketId: (n.ticketId ?? null) as string | null,
      type: n.type as Notification["type"],
      title: n.title,
      body: n.body ?? "",
      link: n.link ?? "",
      isRead: n.isRead,
      createdAt: new Date(n._creationTime).toISOString(),
    }));
  }, [rawNotifications]);

  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const remove = useMutation(api.notifications.remove);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleToggle() {
    setOpen((prev) => !prev);
  }

  async function handleMarkRead(id: string) {
    try {
      await markRead({ id: id as Id<"notifications"> });
    } catch {}
  }

  async function handleDelete(id: string) {
    try {
      await remove({ id: id as Id<"notifications"> });
    } catch {}
  }

  async function handleMarkAllRead() {
    if (!recipientId) return;
    try {
      await markAllRead({ recipientId });
    } catch {}
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleToggle}
        className={`p-1.5 rounded-lg transition relative ${
          open
            ? "text-[var(--accent)] bg-[var(--accent-light)]"
            : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-gray-100"
        }`}
        title="Notifications"
      >
        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] bg-white border border-[var(--border)] rounded-xl shadow-xl overflow-hidden z-50">
          <NotificationList
            notifications={notifications}
            onMarkRead={handleMarkRead}
            onMarkAllRead={handleMarkAllRead}
            canDelete={canDelete}
            onDelete={handleDelete}
          />
        </div>
      )}
    </div>
  );
}
