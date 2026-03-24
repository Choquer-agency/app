"use client";

import { useRouter } from "next/navigation";
import { Notification, NotificationType } from "@/types";
import { friendlyDate } from "@/lib/date-format";

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return friendlyDate(dateStr);
}

function NotificationIcon({ type }: { type: NotificationType }) {
  const className = "w-4 h-4 shrink-0";
  switch (type) {
    case "assigned":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
        </svg>
      );
    case "status_change":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
      );
    case "comment":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
        </svg>
      );
    case "due_soon":
    case "overdue":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      );
    case "hour_cap_warning":
    case "hour_cap_exceeded":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
      );
    case "runaway_timer":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      );
  }
}

function typeColor(type: NotificationType): string {
  switch (type) {
    case "assigned":
      return "text-blue-500";
    case "status_change":
      return "text-purple-500";
    case "comment":
      return "text-green-500";
    case "due_soon":
      return "text-amber-500";
    case "overdue":
    case "runaway_timer":
      return "text-red-500";
    case "hour_cap_warning":
      return "text-orange-500";
    case "hour_cap_exceeded":
      return "text-red-600";
  }
}

interface NotificationListProps {
  notifications: Notification[];
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
}

export default function NotificationList({
  notifications,
  onMarkRead,
  onMarkAllRead,
}: NotificationListProps) {
  const router = useRouter();
  const hasUnread = notifications.some((n) => !n.isRead);

  function handleClick(notification: Notification) {
    if (!notification.isRead) {
      onMarkRead(notification.id);
    }
    if (notification.link) {
      router.push(notification.link);
    }
  }

  return (
    <div>
      <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--foreground)]">Notifications</span>
        {hasUnread && (
          <button
            onClick={onMarkAllRead}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            Mark all as read
          </button>
        )}
      </div>
      <div className="max-h-[360px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-[var(--muted)]">
            No notifications
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition hover:bg-gray-50 ${
                !n.isRead ? "bg-blue-50/50" : ""
              }`}
            >
              <div className={`mt-0.5 ${typeColor(n.type)}`}>
                <NotificationIcon type={n.type} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm leading-tight ${!n.isRead ? "font-medium text-[var(--foreground)]" : "text-[var(--muted)]"}`}>
                  {n.title}
                </div>
                {n.body && (
                  <div className="text-xs text-[var(--muted)] mt-0.5 truncate">
                    {n.body}
                  </div>
                )}
                <div className="text-xs text-[var(--muted)] mt-0.5 opacity-60">
                  {relativeTime(n.createdAt)}
                </div>
              </div>
              {!n.isRead && (
                <div className="mt-1.5 w-2 h-2 rounded-full bg-[var(--accent)] shrink-0" />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
