"use client";

import { useState, useEffect } from "react";

export default function NotificationPermissionBanner() {
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setIsTauri(!!(window as any).__TAURI__);
  }, []);

  if (!isTauri) return null;

  return (
    <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
      <div className="flex items-center gap-3">
        <svg
          className="w-5 h-5 text-emerald-500 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
        <div>
          <p className="text-sm text-emerald-800">
            Desktop notifications are enabled
          </p>
          <p className="text-xs text-emerald-600 mt-0.5">
            Native macOS notifications will appear when you receive new alerts.
            To adjust sound or banners, go to{" "}
            <strong>System Settings &gt; Notifications &gt; Choquer.Agency</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
