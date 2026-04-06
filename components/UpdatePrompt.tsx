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

export default function UpdatePrompt() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [dismissed, setDismissed] = useState(false);

  const isTauri = useCallback(() => {
    return (
      typeof window !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      !!(window as any).__TAURI__
    );
  }, []);

  // Listen for "update-available" event from Rust
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI__.event
      .listen("update-available", (event: { payload: UpdateInfo }) => {
        setUpdate(event.payload);
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

  const handleInstall = async () => {
    if (!isTauri()) return;
    setInstalling(true);
    setProgress(0);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (window as any).__TAURI__.core.invoke("install_update");
    } catch (error) {
      console.error("Update install failed:", error);
      setInstalling(false);
      setProgress(0);
    }
  };

  if (!isTauri() || !update || dismissed) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-white border border-gray-200 rounded-xl shadow-lg p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
          <svg
            className="w-4 h-4 text-blue-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">
            Update available &mdash; v{update.version}
          </p>
          {update.body && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
              {update.body}
            </p>
          )}

          {installing ? (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Downloading...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Install &amp; Restart
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors"
              >
                Later
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
