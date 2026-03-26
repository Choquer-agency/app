"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Notification } from "@/types";
import NotificationList from "./NotificationList";

export default function NotificationBell({ canDelete = false }: { canDelete?: boolean }) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Fetch unread count (lightweight polling)
  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications/count");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch {}
  }, []);

  // Fetch full notification list
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications?limit=20");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
        setLoaded(true);
      }
    } catch {}
  }, []);

  // Poll count every 30s
  useEffect(() => {
    fetchCount();
    pollRef.current = setInterval(fetchCount, 30000);
    return () => clearInterval(pollRef.current);
  }, [fetchCount]);

  // Listen for custom notification events
  useEffect(() => {
    function handleChange() {
      fetchCount();
      if (open) fetchNotifications();
    }
    window.addEventListener("notificationChange", handleChange);
    return () => window.removeEventListener("notificationChange", handleChange);
  }, [fetchCount, fetchNotifications, open]);

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

  // Fetch notifications when dropdown opens
  function handleToggle() {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen) {
      fetchNotifications();
    }
  }

  async function handleMarkRead(id: string) {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await fetch("/api/admin/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markRead", id }),
      });
    } catch {}
  }

  async function handleDelete(id: string) {
    // Optimistic remove
    setNotifications((prev) => prev.filter((n) => n.id !== id));

    try {
      await fetch("/api/admin/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      fetchCount();
    } catch {}
  }

  async function handleMarkAllRead() {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      await fetch("/api/admin/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markAllRead" }),
      });
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
