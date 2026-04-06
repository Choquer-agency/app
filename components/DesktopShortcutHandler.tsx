"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDesktopShortcut, useIsDesktop } from "@/hooks/useDesktop";

/**
 * Listens for desktop-shortcut events from Tauri (global shortcuts + tray actions)
 * and translates them into app navigation or existing event dispatches.
 *
 * Renders nothing. Must be mounted inside the admin layout.
 */
export default function DesktopShortcutHandler() {
  const isDesktop = useIsDesktop();
  const router = useRouter();

  const handler = useCallback(
    (action: string) => {
      switch (action) {
        case "quick_ticket":
          // Navigate to tickets page and trigger create modal
          router.push("/admin/tickets");
          // Small delay to let the page mount before dispatching
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("command-palette:new-ticket")
            );
          }, 300);
          break;

        case "toggle_clock":
          // Navigate to timesheet — the clock in/out button is on the FloatingTimerBar
          // which is always mounted, so we just dispatch the event
          window.dispatchEvent(
            new CustomEvent("desktop-shortcut:toggle-clock")
          );
          break;

        case "notifications":
          // Dispatch event for NotificationBell to open its dropdown
          window.dispatchEvent(
            new CustomEvent("desktop-shortcut:open-notifications")
          );
          break;
      }
    },
    [router]
  );

  useDesktopShortcut(isDesktop ? handler : () => {});

  return null;
}
