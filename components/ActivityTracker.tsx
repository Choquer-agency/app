"use client";

import { useEffect, useRef, useCallback } from "react";

interface ActivityTrackerProps {
  slug: string;
  visitorId?: number;
  deviceId?: string;
}

interface QueuedEvent {
  clientSlug: string;
  eventType: string;
  eventDetail?: Record<string, unknown>;
  sessionId: string;
  deviceType: string;
  referrer?: string;
  visitorId?: number;
  deviceId?: string;
}

function generateSessionId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getDeviceType(): "mobile" | "desktop" | "tablet" {
  if (typeof window === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/tablet|ipad/i.test(ua)) return "tablet";
  if (/mobile|android|iphone/i.test(ua)) return "mobile";
  return "desktop";
}

export default function ActivityTracker({ slug, visitorId, deviceId }: ActivityTrackerProps) {
  const sessionId = useRef<string>("");
  const eventQueue = useRef<QueuedEvent[]>([]);
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const flushRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const viewedSections = useRef<Set<string>>(new Set());

  const enqueue = useCallback(
    (eventType: string, eventDetail?: Record<string, unknown>) => {
      eventQueue.current.push({
        clientSlug: slug,
        eventType,
        eventDetail,
        sessionId: sessionId.current,
        deviceType: getDeviceType(),
        referrer: typeof document !== "undefined" ? document.referrer : undefined,
        visitorId,
        deviceId,
      });
    },
    [slug, visitorId, deviceId]
  );

  const flush = useCallback(() => {
    if (eventQueue.current.length === 0) return;

    const events = [...eventQueue.current];
    eventQueue.current = [];

    const blob = new Blob([JSON.stringify(events)], {
      type: "application/json",
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", blob);
    } else {
      fetch("/api/track", {
        method: "POST",
        body: blob,
        keepalive: true,
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    sessionId.current = generateSessionId();

    // Page view
    enqueue("page_view");

    // Intersection Observer for section tracking
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const section = (entry.target as HTMLElement).dataset.track;
            if (section && !viewedSections.current.has(section)) {
              viewedSections.current.add(section);
              enqueue("section_view", { section });
            }
          }
        });
      },
      { threshold: 0.3 }
    );

    // Observe all tracked sections
    document.querySelectorAll("[data-track]").forEach((el) => {
      observer.observe(el);
    });

    // Click tracking
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const tracked = target.closest("[data-track]") as HTMLElement | null;
      if (!tracked) return;

      const trackType = tracked.dataset.track;

      if (trackType === "link") {
        const href = (tracked as HTMLAnchorElement).href;
        enqueue("link_click", { url: href });
      } else if (trackType === "accordion") {
        const month = tracked.dataset.month;
        enqueue("accordion_open", { month });
      } else if (trackType === "timerange") {
        enqueue("timerange_toggle", {
          range: (target as HTMLButtonElement).textContent,
        });
      }

      // CTA tracking
      if (
        tracked.tagName === "A" &&
        (tracked.textContent?.includes("Check-in") ||
          tracked.textContent?.includes("Strategy") ||
          tracked.textContent?.includes("Book"))
      ) {
        enqueue("cta_click", { cta: tracked.textContent?.trim() });
      }
    }

    // Copy tracking
    function handleCopy() {
      const selection = window.getSelection();
      const parent = selection?.anchorNode?.parentElement?.closest("[data-track]") as HTMLElement | null;
      enqueue("copy_event", { section: parent?.dataset.track || "unknown" });
    }

    // Visibility change — flush on tab hide/close
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flush();
      }
    }

    document.addEventListener("click", handleClick);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Heartbeat every 30s
    heartbeatRef.current = setInterval(() => {
      enqueue("time_on_page", { seconds: 30 });
    }, 30000);

    // Flush every 10s
    flushRef.current = setInterval(flush, 10000);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleClick);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(heartbeatRef.current);
      clearInterval(flushRef.current);
      flush();
    };
  }, [slug, enqueue, flush]);

  return null; // Invisible component
}
