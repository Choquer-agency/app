"use client";

import { useState, useEffect, useCallback } from "react";
import { type ClockStatus, type ShiftStatus, deriveClockStatus } from "./useClockStatus";

export function useClockStatusPoll(pollInterval = 30000) {
  const [clockStatus, setClockStatus] = useState<ClockStatus>("idle");
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/timesheet/status");
      if (res.ok) {
        const data: ShiftStatus = await res.json();
        setClockStatus(deriveClockStatus(data));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, pollInterval);
    return () => clearInterval(id);
  }, [fetchStatus, pollInterval]);

  // Listen for clock status changes from the QuickClockBar / ClockInOutCard
  useEffect(() => {
    const handler = () => {
      // Re-fetch after a short delay to allow the server to process
      setTimeout(fetchStatus, 500);
    };
    window.addEventListener("clockStatusChange", handler);
    return () => window.removeEventListener("clockStatusChange", handler);
  }, [fetchStatus]);

  // ═══ TEMPORARY DEMO MODE — remove after review ═══
  const DEMO_MODE = true;
  if (DEMO_MODE) return { clockStatus: "working" as ClockStatus, loading: false, refetch: fetchStatus };
  // ═══ END DEMO MODE ═══

  return { clockStatus, loading, refetch: fetchStatus };
}
