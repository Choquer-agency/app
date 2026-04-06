"use client";

import { useState, useEffect, useCallback } from "react";
import { useIsDesktop } from "@/hooks/useDesktop";

interface UpdateInfo {
  version: string;
  body: string | null;
  date: string | null;
}

interface DownloadProgress {
  downloaded: number;
  total: number | null;
}

export default function AppSettings() {
  const isDesktop = useIsDesktop();
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [upToDate, setUpToDate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tauri = useCallback((): any | null => {
    if (typeof window === "undefined") return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__TAURI__ ?? null;
  }, []);

  // Get current version on mount
  useEffect(() => {
    const t = tauri();
    if (!t) return;
    t.core
      .invoke("get_app_version")
      .then((v: string) => setVersion(v))
      .catch(() => {});
  }, [tauri]);

  // Listen for auto-install events (from the hourly background loop)
  useEffect(() => {
    const t = tauri();
    if (!t) return;

    let unlistenInstalling: (() => void) | null = null;
    let unlistenProgress: (() => void) | null = null;

    t.event
      .listen("update-auto-installing", (event: { payload: UpdateInfo }) => {
        setUpdateInfo(event.payload);
        setInstalling(true);
        setProgress(0);
        setUpToDate(false);
      })
      .then((fn: () => void) => {
        unlistenInstalling = fn;
      });

    t.event
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
        unlistenProgress = fn;
      });

    return () => {
      if (unlistenInstalling) unlistenInstalling();
      if (unlistenProgress) unlistenProgress();
    };
  }, [tauri]);

  const handleCheck = async () => {
    const t = tauri();
    if (!t) return;

    setChecking(true);
    setError(null);
    setUpToDate(false);
    setUpdateInfo(null);

    try {
      const result = await t.core.invoke("check_for_update");
      if (result) {
        setUpdateInfo(result);
      } else {
        setUpToDate(true);
      }
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to check for updates");
    } finally {
      setChecking(false);
    }
  };

  const handleInstall = async () => {
    const t = tauri();
    if (!t) return;

    setInstalling(true);
    setProgress(0);
    setError(null);

    try {
      await t.core.invoke("install_update");
      // App will restart — this line won't be reached
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to install update");
      setInstalling(false);
    }
  };

  if (!isDesktop) {
    return (
      <div className="p-6 bg-zinc-50 border border-zinc-200 rounded-lg text-center">
        <p className="text-sm text-[var(--muted)]">
          App settings are only available in the{" "}
          <strong>Choquer.Agency desktop app</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Version Info */}
      <div className="p-4 border border-zinc-200 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-[var(--foreground)]">
              Current Version
            </h3>
            <p className="text-lg font-mono text-[var(--foreground)] mt-1">
              {version ? `v${version}` : "..."}
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-zinc-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Update Check */}
      <div className="p-4 border border-zinc-200 rounded-lg">
        <h3 className="text-sm font-medium text-[var(--foreground)] mb-1">
          Updates
        </h3>
        <p className="text-xs text-[var(--muted)] mb-4">
          Updates are checked automatically every hour and installed in the
          background. The app restarts itself when a new version is ready.
        </p>

        {/* Status Messages */}
        {upToDate && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <svg
              className="w-4 h-4 text-emerald-500 shrink-0"
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
            <span className="text-xs text-emerald-800">
              You&apos;re on the latest version.
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <svg
              className="w-4 h-4 text-red-500 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
            <span className="text-xs text-red-800">{error}</span>
          </div>
        )}

        {updateInfo && !installing && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs font-medium text-blue-800">
              Update available: v{updateInfo.version}
            </p>
            {updateInfo.body && (
              <p className="text-xs text-blue-700 mt-1 line-clamp-2">
                {updateInfo.body}
              </p>
            )}
            <button
              onClick={handleInstall}
              className="mt-2 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Install &amp; Restart Now
            </button>
          </div>
        )}

        {installing && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs font-medium text-blue-800">
              {updateInfo
                ? `Installing v${updateInfo.version}...`
                : "Installing update..."}
            </p>
            <div className="mt-2">
              <div className="flex items-center justify-between text-[10px] text-blue-600 mb-1">
                <span>
                  {progress < 100 ? "Downloading..." : "Installing..."}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-blue-100 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <p className="text-[10px] text-blue-600 mt-2">
              The app will restart automatically.
            </p>
          </div>
        )}

        {/* Manual Check Button */}
        {!installing && (
          <button
            onClick={handleCheck}
            disabled={checking}
            className="px-4 py-2 text-xs font-medium text-[var(--foreground)] bg-zinc-100 border border-zinc-200 rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {checking ? "Checking..." : "Check for Updates"}
          </button>
        )}
      </div>
    </div>
  );
}
