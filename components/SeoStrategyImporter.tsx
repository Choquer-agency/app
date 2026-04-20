"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClientConfig } from "@/types";

interface MonthResult {
  monthKey: string;
  headingText: string;
  status: "complete" | "active" | "forecast";
  saved: boolean;
  error?: string;
}

interface ImportRecord {
  clientName: string;
  startedAt: number;
  monthsImported: number;
  monthsAttempted: number;
  results: MonthResult[];
  // populated by the progress poller
  progress?: {
    total: number;
    idle: number;
    queued: number;
    running: number;
    error: number;
  };
}

interface ProgressResponse {
  total: number;
  idle: number;
  queued: number;
  running: number;
  error: number;
}

export default function SeoStrategyImporter() {
  const currentYear = new Date().getFullYear();
  const [clients, setClients] = useState<ClientConfig[]>([]);
  const [history, setHistory] = useState<Record<string, ImportRecord>>({});
  const [selectedClientId, setSelectedClientId] = useState("");
  const [defaultYear, setDefaultYear] = useState(currentYear);
  const [pasteContent, setPasteContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/admin/clients")
      .then((r) => r.json())
      .then((data: ClientConfig[]) => {
        const filtered = data.filter(
          (c) => c.clientStatus === "active" || c.clientStatus === "new"
        );
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        setClients(filtered);
      })
      .catch(() => {});
  }, []);

  // Poll progress for any client currently running.
  useEffect(() => {
    const activeIds = Object.entries(history)
      .filter(
        ([, h]) =>
          !h.progress || h.progress.queued + h.progress.running > 0
      )
      .map(([id]) => id);

    if (activeIds.length === 0) {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }

    const tick = async () => {
      const updates = await Promise.all(
        activeIds.map(async (id) => {
          try {
            const r = await fetch(
              `/api/admin/seo-strategy/import/progress?clientId=${id}`
            );
            if (!r.ok) return null;
            const data: ProgressResponse = await r.json();
            return { id, data };
          } catch {
            return null;
          }
        })
      );
      setHistory((prev) => {
        const next = { ...prev };
        for (const u of updates) {
          if (u && next[u.id]) next[u.id] = { ...next[u.id], progress: u.data };
        }
        return next;
      });
    };

    tick();
    pollTimer.current = setInterval(tick, 4000);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [history]);

  const sortedClients = useMemo(() => {
    return [...clients].sort((a, b) => {
      const aDone = !!history[a.id];
      const bDone = !!history[b.id];
      if (aDone === bDone) return a.name.localeCompare(b.name);
      return aDone ? 1 : -1;
    });
  }, [clients, history]);

  async function handleSubmit() {
    setTopError(null);
    if (!selectedClientId || !pasteContent.trim() || submitting) return;
    const id = selectedClientId;
    const client = clients.find((c) => c.id === id);
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/seo-strategy/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: id,
          rawMarkdown: pasteContent,
          defaultYear,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setHistory((prev) => ({
          ...prev,
          [id]: {
            clientName: client?.name ?? "Client",
            startedAt: Date.now(),
            monthsImported: data.monthsImported,
            monthsAttempted: data.monthsAttempted,
            results: data.results,
          },
        }));
        setPasteContent("");
        setSelectedClientId("");
      } else {
        setTopError(data.error || "Import failed");
      }
    } catch (err) {
      setTopError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const totalDone = Object.keys(history).length;
  const yearOptions = Array.from({ length: 7 }, (_, i) => currentYear - 5 + i);
  const canSubmit = !!selectedClientId && !!pasteContent.trim() && !submitting;

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="bg-white border border-[var(--border)] rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-[11px] uppercase tracking-wide font-semibold text-[var(--muted)] mb-1.5">
            Client
          </label>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="w-full text-sm border border-[var(--border)] rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
          >
            <option value="">Select a client…</option>
            {sortedClients.map((c) => {
              const h = history[c.id];
              const inProgress =
                h?.progress && h.progress.queued + h.progress.running > 0;
              const suffix = inProgress ? " ⏳" : h ? " ✓" : "";
              return (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {suffix}
                </option>
              );
            })}
          </select>
        </div>
        <div className="w-[140px]">
          <label className="block text-[11px] uppercase tracking-wide font-semibold text-[var(--muted)] mb-1.5">
            Default year
          </label>
          <select
            value={defaultYear}
            onChange={(e) => setDefaultYear(Number(e.target.value))}
            className="w-full text-sm border border-[var(--border)] rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-[var(--muted)]">
            <span className="font-semibold text-[var(--foreground)]">{totalDone}</span>{" "}
            / {clients.length} started
          </span>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="text-sm px-5 py-2 rounded-lg bg-[var(--accent)] text-white font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {submitting ? "Starting…" : "Start in background"}
          </button>
        </div>
      </div>

      {topError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
          {topError}
        </div>
      )}

      {/* Editor — plain textarea, raw markdown */}
      <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[#FAF9F5]">
          <p className="text-xs text-[var(--muted)]">
            Paste straight from Notion as plain text. Each month should be on its own
            line — e.g.{" "}
            <code className="px-1 py-0.5 bg-white border border-[var(--border)] rounded text-[10px]">
              ## March 2025
            </code>{" "}
            or{" "}
            <code className="px-1 py-0.5 bg-white border border-[var(--border)] rounded text-[10px]">
              ### April
            </code>
            . When the year flips, drop a year-only line like{" "}
            <code className="px-1 py-0.5 bg-white border border-[var(--border)] rounded text-[10px]">
              ## 2024
            </code>
            . The default year above seeds the first slice until a year heading is
            seen.
          </p>
        </div>
        <textarea
          value={pasteContent}
          onChange={(e) => setPasteContent(e.target.value)}
          placeholder="Paste your Notion board here…"
          rows={22}
          spellCheck={false}
          className="w-full text-xs font-mono px-4 py-3 bg-white outline-none resize-y leading-relaxed"
        />
        <div className="px-4 py-2 border-t border-[var(--border)] text-[10px] text-[var(--muted)] flex items-center justify-between">
          <span>{pasteContent.length.toLocaleString()} chars</span>
          <span>Server converts markdown → structured month chunks on submit.</span>
        </div>
      </div>

      {/* Recent imports */}
      {Object.keys(history).length > 0 && (
        <div className="bg-white border border-[var(--border)] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
            Background jobs
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(history)
              .sort(([, a], [, b]) => b.startedAt - a.startedAt)
              .map(([id, rec]) => {
                const remaining =
                  (rec.progress?.queued ?? 0) + (rec.progress?.running ?? 0);
                const done =
                  (rec.progress?.idle ?? 0) + (rec.progress?.error ?? 0);
                const pct = rec.progress?.total
                  ? Math.round((done / rec.progress.total) * 100)
                  : 0;
                const finished = rec.progress != null && remaining === 0;
                const errored = (rec.progress?.error ?? 0) > 0;

                const badgeClass = !rec.progress
                  ? "bg-amber-50 text-amber-700"
                  : finished && errored
                    ? "bg-red-50 text-red-700"
                    : finished
                      ? "bg-[#BDFFE8] text-[#0d7a55]"
                      : "bg-amber-50 text-amber-700";
                const badgeLabel = !rec.progress
                  ? "starting…"
                  : finished && errored
                    ? "done with errors"
                    : finished
                      ? "done"
                      : `${remaining} left`;

                return (
                  <div
                    key={id}
                    className="text-xs border border-[var(--border)] rounded-lg p-3 space-y-2 bg-[#FAF9F5]"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm text-[var(--foreground)]">
                        {rec.clientName}
                      </p>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${badgeClass}`}
                      >
                        {badgeLabel}
                      </span>
                    </div>
                    <p className="text-[var(--muted)]">
                      <span className="text-[var(--foreground)] font-semibold">
                        {rec.monthsImported}
                      </span>{" "}
                      months saved · enriching serially in the background
                    </p>
                    {rec.progress && (
                      <div className="space-y-1">
                        <div className="h-1.5 w-full bg-[var(--border)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--accent)] transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-[var(--muted)]">
                          <span>{done} enriched</span>
                          <span>{remaining} pending</span>
                          {rec.progress.error > 0 && (
                            <span className="text-red-700">
                              {rec.progress.error} error
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
