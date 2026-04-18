"use client";

import { useEffect, useState } from "react";

export default function ReadOnlyToast() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    function onBlocked(e: Event) {
      const ce = e as CustomEvent<{ kind: string; fnName: string }>;
      const detail = ce.detail;
      setMsg(`Blocked (read-only): ${detail.kind} — ${detail.fnName}`);
      const t = setTimeout(() => setMsg(null), 3500);
      return () => clearTimeout(t);
    }
    window.addEventListener("dev-readonly-blocked", onBlocked);
    return () => window.removeEventListener("dev-readonly-blocked", onBlocked);
  }, []);

  if (!msg) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold shadow-lg pointer-events-none"
      style={{ maxWidth: "90%" }}
    >
      {msg}
    </div>
  );
}
