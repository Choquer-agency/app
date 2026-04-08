"use client";

import { useCallback, useEffect, useState } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTauri(): any | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).__TAURI__ ?? null;
}

/** Returns true if running inside the Tauri desktop app */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    setIsDesktop(getTauri() !== null);
  }, []);
  return isDesktop;
}

// ── Autostart ──

export function useAutostart() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const tauri = getTauri();
    if (!tauri) return;
    tauri.core
      .invoke("is_autostart_enabled")
      .then((v: boolean) => setEnabled(v))
      .catch(() => setEnabled(null));
  }, []);

  const toggle = useCallback(async () => {
    const tauri = getTauri();
    if (!tauri) return;
    setLoading(true);
    try {
      if (enabled) {
        await tauri.core.invoke("disable_autostart");
        setEnabled(false);
      } else {
        await tauri.core.invoke("enable_autostart");
        setEnabled(true);
      }
    } catch {
      // Silent — non-critical
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  return { enabled, toggle, loading };
}

// ── Clipboard ──

export function useClipboard() {
  const copy = useCallback(async (text: string): Promise<boolean> => {
    const tauri = getTauri();
    if (tauri) {
      try {
        await tauri.core.invoke("write_to_clipboard", { text });
        return true;
      } catch {
        // Fall through to browser API
      }
    }
    // Browser fallback
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { copy };
}

// ── Invoke Tauri Command ──

/** Fire-and-forget a Tauri command (no-op when running in browser) */
export async function invokeDesktop(command: string, args?: Record<string, unknown>) {
  const tauri = getTauri();
  if (!tauri) return;
  try {
    await tauri.core.invoke(command, args);
  } catch {
    // Silent — non-critical
  }
}

// ── Desktop Shortcut Events ──

/** Listen for desktop shortcut events dispatched from Tauri (global shortcuts + tray actions) */
export function useDesktopShortcut(
  handler: (action: string) => void
) {
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (typeof detail === "string") {
        handler(detail);
      }
    };
    window.addEventListener("desktop-shortcut", listener);
    return () => window.removeEventListener("desktop-shortcut", listener);
  }, [handler]);
}
