"use client";

import { useEffect, useMemo, useState } from "react";
import { ClientConfig } from "@/types";

interface ImportRecord {
  status: "pending" | "running" | "done" | "error";
  monthsImported?: number;
  error?: string;
}

export default function SeoStrategyImporter() {
  const [clients, setClients] = useState<ClientConfig[]>([]);
  const [history, setHistory] = useState<Record<string, ImportRecord>>({});
  const [selectedClientId, setSelectedClientId] = useState("");
  const [pasteContent, setPasteContent] = useState("");
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClientId || !pasteContent.trim()) return;
    const id = selectedClientId;
    setSubmitting(true);
    setHistory((prev) => ({ ...prev, [id]: { status: "running" } }));

    try {
      const res = await fetch("/api/admin/seo-strategy/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: id, rawNotionMarkdown: pasteContent }),
      });
      const data = await res.json();
      if (res.ok) {
        setHistory((prev) => ({
          ...prev,
          [id]: { status: "done", monthsImported: data.monthsImported },
        }));
        setPasteContent("");
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-[var(--border)] rounded-xl p-5 space-y-4"
      >
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
              const suffix = h?.status === "done" ? " ✓" : h?.status === "error" ? " ⚠" : "";
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
            Paste full Notion board content
          </label>
          <textarea
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
            placeholder="## SEO Updates April 2026&#10;- [x] Optimize meta titles&#10;..."
            rows={20}
            className="w-full text-xs font-mono border border-[var(--border)] rounded-lg px-3 py-2 bg-white"
          />
          <p className="text-[10px] text-[var(--muted)] mt-1">
            {pasteContent.length.toLocaleString()} chars. Detected month headings will be split into per-month rows automatically.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--muted)]">
            Imported so far: <span className="font-semibold text-[var(--foreground)]">{totalDone}</span> / {clients.length}
          </span>
          <button
            type="submit"
            disabled={submitting || !selectedClientId || !pasteContent.trim()}
            className="text-sm px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition"
          >
            {submitting ? "Importing…" : "Import in background"}
          </button>
        </div>
      </form>

      <div className="bg-white border border-[var(--border)] rounded-xl p-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
          Recent imports
        </h3>
        <div className="space-y-2 max-h-[480px] overflow-y-auto">
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
                className="flex items-center justify-between text-xs border border-[var(--border)] rounded-lg px-3 py-2"
              >
                <div>
                  <p className="font-medium text-[var(--foreground)]">{client.name}</p>
                  {rec.monthsImported != null && (
                    <p className="text-[var(--muted)]">{rec.monthsImported} months queued</p>
                  )}
                  {rec.error && <p className="text-red-700">{rec.error}</p>}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${badge}`}>
                  {rec.status}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
