"use client";

import { useState, useEffect, useCallback } from "react";

interface UpdateInfo {
  version: string;
  body: string | null;
  date: string | null;
}

interface DownloadProgress {
  downloaded: number;
  total: number | null;
}

/**
 * Shows a non-dismissable toast when an auto-update is being downloaded/installed.
 * The app restarts automatically once the install completes.
 */
export default function UpdatePrompt() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number>(0);

  const isTauri = useCallback(() => {
    return (
      typeof window !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      !!(window as any).__TAURI__
    );
  }, []);

  // Listen for auto-install event from Rust
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI__.event
      .listen("update-auto-installing", (event: { payload: UpdateInfo }) => {
        setUpdate(event.payload);
        setInstalling(true);
        setProgress(0);
      })
      .then((fn: () => void) => {
        unlisten = fn;
      });

    return () => {
      if (unlisten) unlisten();
    };
  }, [isTauri]);

  // Listen for download progress events
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI__.event
      .listen(
        "update-download-progress",
        (event: { payload: DownloadProgress }) => {
          const { downloaded, total } = event.payload;
          if (total && total > 0) {
            setProgress(Math.round((downloaded / total) * 100));
          }
        }
      )
      .then((fn: () => void) => {
        unlisten = fn;
      });

    return () => {
      if (unlisten) unlisten();
    };
  }, [isTauri]);

  if (!isTauri() || !installing || !update) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-white border border-gray-200 rounded-xl shadow-lg p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
          <svg
            className="w-4 h-4 text-blue-600 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">
            Updating to v{update.version}...
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            The app will restart automatically.
          </p>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>{progress < 100 ? "Downloading..." : "Installing..."}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
