"use client";

import { useIsDesktop, useAutostart } from "@/hooks/useDesktop";

export default function DesktopSettings() {
  const isDesktop = useIsDesktop();
  const { enabled, toggle, loading } = useAutostart();

  if (!isDesktop) {
    return (
      <div className="p-6 bg-zinc-50 border border-zinc-200 rounded-lg text-center">
        <p className="text-sm text-[var(--muted)]">
          These settings are only available in the{" "}
          <strong>Choquer.Agency desktop app</strong>.
        </p>
        <p className="text-xs text-[var(--muted)] mt-2">
          Download it from the team drive or ask your admin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Auto-Launch */}
      <div className="p-4 border border-zinc-200 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-[var(--foreground)]">
              Launch at Login
            </h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Automatically start Choquer.Agency when you log into your Mac.
              The app opens minimized in the menu bar.
            </p>
          </div>
          <button
            onClick={toggle}
            disabled={loading || enabled === null}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
              enabled ? "bg-blue-600" : "bg-zinc-200"
            }`}
            role="switch"
            aria-checked={enabled ?? false}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Global Shortcuts Info */}
      <div className="p-4 border border-zinc-200 rounded-lg">
        <h3 className="text-sm font-medium text-[var(--foreground)] mb-3">
          Global Keyboard Shortcuts
        </h3>
        <p className="text-xs text-[var(--muted)] mb-3">
          These shortcuts work system-wide, even when the app is in the
          background.
        </p>
        <div className="space-y-2">
          <ShortcutRow keys="Cmd + Shift + I" action="Show / focus app" />
          <ShortcutRow keys="Cmd + Shift + T" action="Quick create ticket" />
          <ShortcutRow keys="Cmd + Shift + C" action="Toggle clock in/out" />
        </div>
      </div>

      {/* Tray Quick Actions Info */}
      <div className="p-4 border border-zinc-200 rounded-lg">
        <h3 className="text-sm font-medium text-[var(--foreground)] mb-2">
          Menu Bar Quick Actions
        </h3>
        <p className="text-xs text-[var(--muted)]">
          Right-click the Choquer.Agency icon in your menu bar for quick
          access to create tickets, clock in/out, and navigate to any section.
        </p>
      </div>
    </div>
  );
}

function ShortcutRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-[var(--muted)]">{action}</span>
      <kbd className="px-2 py-0.5 bg-zinc-100 border border-zinc-300 rounded text-[10px] font-mono text-zinc-600">
        {keys}
      </kbd>
    </div>
  );
}
