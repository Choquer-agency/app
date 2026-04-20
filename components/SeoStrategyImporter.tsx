"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ClientConfig } from "@/types";

const TiptapEditor = dynamic(() => import("./TiptapEditor"), { ssr: false });

const EMPTY_DOC = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });

interface MonthResult {
  monthKey: string;
  headingText: string;
  status: "complete" | "active" | "forecast";
  saved: boolean;
  enriched: boolean;
  error?: string;
}

interface ImportRecord {
  status: "running" | "done" | "error";
  monthsImported?: number;
  monthsEnriched?: number;
  monthsAttempted?: number;
  results?: MonthResult[];
  error?: string;
}

export default function SeoStrategyImporter() {
  const currentYear = new Date().getFullYear();
  const [clients, setClients] = useState<ClientConfig[]>([]);
  const [history, setHistory] = useState<Record<string, ImportRecord>>({});
  const [selectedClientId, setSelectedClientId] = useState("");
  const [defaultYear, setDefaultYear] = useState(currentYear);
  const [editorContent, setEditorContent] = useState(EMPTY_DOC);
  const [editorKey, setEditorKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

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

  const sortedClients = useMemo(() => {
    return [...clients].sort((a, b) => {
      const aDone = history[a.id]?.status === "done";
      const bDone = history[b.id]?.status === "done";
      if (aDone === bDone) return a.name.localeCompare(b.name);
      return aDone ? 1 : -1;
    });
  }, [clients, history]);

  function isEmpty(json: string): boolean {
    try {
      const doc = JSON.parse(json);
      const content = doc?.content ?? [];
      if (content.length === 0) return true;
      if (content.length === 1 && content[0].type === "paragraph" && !content[0].content) {
        return true;
      }
    } catch {
      return true;
    }
    return false;
  }

  async function handleSubmit() {
    if (!selectedClientId || isEmpty(editorContent) || submitting) return;
    const id = selectedClientId;
    setSubmitting(true);
    setHistory((prev) => ({ ...prev, [id]: { status: "running" } }));

    try {
      const res = await fetch("/api/admin/seo-strategy/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: id,
          rawContent: editorContent,
          defaultYear,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setHistory((prev) => ({
          ...prev,
          [id]: {
            status: "done",
            monthsImported: data.monthsImported,
            monthsEnriched: data.monthsEnriched,
            monthsAttempted: data.monthsAttempted,
            results: data.results,
          },
        }));
        setEditorContent(EMPTY_DOC);
        setEditorKey((k) => k + 1);
        setSelectedClientId("");
      } else {
        setHistory((prev) => ({
          ...prev,
          [id]: { status: "error", error: data.error || "Import failed" },
        }));
      }
    } catch (err) {
      setHistory((prev) => ({
        ...prev,
        [id]: { status: "error", error: err instanceof Error ? err.message : String(err) },
      }));
    } finally {
      setSubmitting(false);
    }
  }

  const totalDone = Object.values(history).filter((h) => h.status === "done").length;
  const yearOptions = Array.from({ length: 7 }, (_, i) => currentYear - 5 + i);
  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const canSubmit = !!selectedClientId && !isEmpty(editorContent) && !submitting;

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
              const suffix =
                h?.status === "done" ? " ✓" : h?.status === "error" ? " ⚠" : "";
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
            / {clients.length} done
          </span>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="text-sm px-5 py-2 rounded-lg bg-[var(--accent)] text-white font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {submitting ? "Importing & enriching…" : "Import & enrich"}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between bg-[#FAF9F5]">
          <p className="text-xs text-[var(--muted)]">
            Paste straight from Notion. Each month should be its own line —{" "}
            <code className="px-1 py-0.5 bg-white border border-[var(--border)] rounded text-[10px]">
              March
            </code>
            ,{" "}
            <code className="px-1 py-0.5 bg-white border border-[var(--border)] rounded text-[10px]">
              March 2025
            </code>
            , or{" "}
            <code className="px-1 py-0.5 bg-white border border-[var(--border)] rounded text-[10px]">
              SEO Updates April 2026
            </code>
            . Drop a year-only line like{" "}
            <code className="px-1 py-0.5 bg-white border border-[var(--border)] rounded text-[10px]">
              2024
            </code>{" "}
            between months when the year flips.
          </p>
          {selectedClient && (
            <span className="text-[11px] text-[var(--muted)] whitespace-nowrap">
              Importing into: <span className="font-semibold text-[var(--foreground)]">{selectedClient.name}</span>
            </span>
          )}
        </div>
        <div className="min-h-[520px]">
          <TiptapEditor
            key={editorKey}
            content={editorContent}
            onChange={setEditorContent}
            editable
            placeholder="Paste your Notion board here…"
          />
        </div>
      </div>

      {/* Recent imports — full width below */}
      {Object.keys(history).length > 0 && (
        <div className="bg-white border border-[var(--border)] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
            Recent imports
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(history).map(([id, rec]) => {
              const client = clients.find((c) => c.id === id);
              if (!client) return null;
              const badgeStyle =
                rec.status === "done"
                  ? "bg-[#BDFFE8] text-[#0d7a55]"
                  : rec.status === "error"
                    ? "bg-red-50 text-red-700"
                    : "bg-amber-50 text-amber-700";
              const badgeLabel =
                rec.status === "running"
                  ? "running…"
                  : rec.status === "done"
                    ? "done"
                    : "error";
              return (
                <div
                  key={id}
                  className="text-xs border border-[var(--border)] rounded-lg p-3 space-y-2 bg-[#FAF9F5]"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm text-[var(--foreground)]">
                      {client.name}
                    </p>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${badgeStyle}`}
                    >
                      {badgeLabel}
                    </span>
                  </div>
                  {rec.status === "done" && (
                    <p className="text-[var(--muted)]">
                      <span className="text-[var(--foreground)] font-semibold">
                        {rec.monthsImported}
                      </span>{" "}
                      months saved ·{" "}
                      <span className="text-[var(--foreground)] font-semibold">
                        {rec.monthsEnriched}
                      </span>{" "}
                      enriched
                    </p>
                  )}
                  {rec.results && rec.results.length > 0 && (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 max-h-40 overflow-y-auto">
                      {rec.results.map((r) => (
                        <div
                          key={r.monthKey}
                          className="flex items-center justify-between text-[11px]"
                        >
                          <span className="text-[var(--foreground)] truncate">
                            {r.monthKey}
                          </span>
                          <span
                            className={`text-[10px] ml-2 ${
                              r.enriched
                                ? "text-[#0d7a55]"
                                : r.saved
                                  ? "text-amber-700"
                                  : "text-red-700"
                            }`}
                          >
                            {r.enriched
                              ? "✓"
                              : r.saved
                                ? "saved"
                                : r.error ?? "fail"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {rec.error && <p className="text-red-700">{rec.error}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
