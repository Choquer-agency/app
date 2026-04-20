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
  error?: string;
}

interface ImportRecord {
  status: "running" | "done" | "error";
  monthsImported?: number;
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
      <div className="bg-white border border-[var(--border)] rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">
              Client
            </label>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full text-sm border border-[var(--border)] rounded-lg px-3 py-2 bg-white"
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
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">
              Default year
            </label>
            <select
              value={defaultYear}
              onChange={(e) => setDefaultYear(Number(e.target.value))}
              className="w-full text-sm border border-[var(--border)] rounded-lg px-3 py-2 bg-white"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1">
            Paste full Notion board content
          </label>
          <p className="text-[11px] text-[var(--muted)] mb-2 leading-relaxed">
            Paste straight from Notion — formatting will carry. Each month should be its
            own heading (<code>March</code>, <code>March 2025</code>, or
            <code> SEO Updates April 2026</code>). When the year flips, drop a year-only
            heading like <code>2024</code> in between months. The default year is used
            for the first slice until a year heading is found.
          </p>
          <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-white min-h-[420px]">
            <TiptapEditor
              key={editorKey}
              content={editorContent}
              onChange={setEditorContent}
              editable
              placeholder="Paste your Notion board here…"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--muted)]">
            Imported so far:{" "}
            <span className="font-semibold text-[var(--foreground)]">{totalDone}</span> /{" "}
            {clients.length}
          </span>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !selectedClientId || isEmpty(editorContent)}
            className="text-sm px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition"
          >
            {submitting ? "Importing…" : "Import & queue enrichment"}
          </button>
        </div>
      </div>

      <div className="bg-white border border-[var(--border)] rounded-xl p-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
          Recent imports
        </h3>
        <div className="space-y-3 max-h-[640px] overflow-y-auto">
          {Object.entries(history).length === 0 && (
            <p className="text-xs text-[var(--muted)]">No imports yet this session.</p>
          )}
          {Object.entries(history).map(([id, rec]) => {
            const client = clients.find((c) => c.id === id);
            if (!client) return null;
            const badge =
              rec.status === "done"
                ? "bg-[#BDFFE8] text-[#0d7a55]"
                : rec.status === "error"
                  ? "bg-red-50 text-red-700"
                  : "bg-amber-50 text-amber-700";
            return (
              <div
                key={id}
                className="text-xs border border-[var(--border)] rounded-lg px-3 py-2 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-[var(--foreground)]">{client.name}</p>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${badge}`}
                  >
                    {rec.status}
                  </span>
                </div>
                {rec.monthsImported != null && (
                  <p className="text-[var(--muted)]">
                    {rec.monthsImported} / {rec.monthsAttempted ?? rec.monthsImported}{" "}
                    months queued for enrichment
                  </p>
                )}
                {rec.results && rec.results.length > 0 && (
                  <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                    {rec.results.map((r) => (
                      <li
                        key={r.monthKey}
                        className="flex items-center justify-between text-[11px]"
                      >
                        <span className="text-[var(--foreground)]">
                          {r.monthKey}
                          <span className="text-[var(--muted)]"> · {r.headingText}</span>
                        </span>
                        <span
                          className={
                            r.saved
                              ? "text-[#0d7a55]"
                              : "text-red-700"
                          }
                        >
                          {r.saved ? r.status : r.error ?? "failed"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {rec.error && <p className="text-red-700">{rec.error}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
