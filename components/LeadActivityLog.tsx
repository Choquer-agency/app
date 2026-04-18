"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import FilterDropdown from "./FilterDropdown";

type LogType = "email" | "meeting" | "note" | "transcript" | "phone";

const TYPE_CONFIG: Record<LogType, { label: string; bg: string; dot: string }> = {
  email:      { label: "Email",       bg: "#B1D0FF", dot: "#3b82f6" },
  meeting:    { label: "Meeting",     bg: "#BDFFE8", dot: "#10b981" },
  note:       { label: "Note",        bg: "#FFF09E", dot: "#eab308" },
  transcript: { label: "Transcript",  bg: "#FBBDFF", dot: "#a855f7" },
  phone:      { label: "Phone",       bg: "#FFA69E", dot: "#f97316" },
};

function formatDate(ms: number) {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateInput(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function LeadActivityLog({
  leadId,
  company,
}: {
  leadId: string;
  company: string;
}) {
  const logs = useQuery(api.leadLogs.listByLead, { leadId: leadId as Id<"leads"> });
  const createLog = useMutation(api.leadLogs.create);
  const updateLog = useMutation(api.leadLogs.update);
  const removeLog = useMutation(api.leadLogs.remove);

  const [type, setType] = useState<LogType>("meeting");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => formatDateInput(Date.now()));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedRow, setCopiedRow] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleRow = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  async function handleAdd() {
    if (!content.trim()) return;
    const autoTitle = title.trim() || content.trim().split(/\n/)[0].slice(0, 80);
    setSaving(true);
    try {
      await createLog({
        leadId: leadId as Id<"leads">,
        type,
        title: autoTitle,
        content: content.trim(),
        occurredAt: new Date(occurredAt).getTime(),
      });
      setTitle("");
      setContent("");
      setOccurredAt(formatDateInput(Date.now()));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this entry?")) return;
    await removeLog({ id: id as Id<"leadLogs"> });
  }

  async function handleCopyRow(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedRow(id);
    setTimeout(() => setCopiedRow(null), 1500);
  }

  async function handleCopyAll() {
    if (!logs || logs.length === 0) return;
    const ordered = [...logs].sort((a, b) => a.occurredAt - b.occurredAt);
    const out = [
      `# ${company} — Full Activity Log`,
      `Exported ${new Date().toLocaleString()}`,
      "",
      ...ordered.map((l) => {
        return [
          `## [${TYPE_CONFIG[l.type as LogType]?.label ?? l.type}] ${l.title}`,
          formatDate(l.occurredAt),
          "",
          l.content,
          "",
        ].join("\n");
      }),
    ].join("\n");
    await navigator.clipboard.writeText(out);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1800);
  }

  return (
    <div className="px-6 py-5 space-y-5">
      {/* Copy-all top bar */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Activity Log</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Every interaction with this lead — emails, meetings, transcripts, notes. Copy it all to paste into Claude Desktop.
          </p>
        </div>
        <button
          onClick={handleCopyAll}
          disabled={!logs || logs.length === 0}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition ${
            copiedAll
              ? "border-emerald-400 bg-emerald-50 text-emerald-700"
              : "border-[var(--border)] bg-white text-[var(--foreground)] hover:bg-[var(--hover-tan)] disabled:opacity-40"
          }`}
        >
          {copiedAll ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy Everything
            </>
          )}
        </button>
      </div>

      {/* New entry */}
      <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: "#FAF9F5" }}>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <FilterDropdown
            label="Type"
            value={type}
            onChange={(v) => setType(v as LogType)}
            options={(Object.keys(TYPE_CONFIG) as LogType[]).map((t) => ({
              value: t,
              label: TYPE_CONFIG[t].label,
              dot: TYPE_CONFIG[t].dot,
            }))}
          />
          <input
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
          />
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional — auto-generated from first line)"
            className="flex-1 min-w-[200px] px-3 py-2 text-sm bg-white border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
          />
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste the email, transcript, or meeting notes..."
          rows={5}
          className="w-full px-3 py-2 text-sm bg-white border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 resize-y"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={handleAdd}
            disabled={saving || !content.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            {saving ? "Saving..." : "+ Add Entry"}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {logs === undefined ? (
          <p className="text-xs text-[var(--muted)] text-center py-4">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="text-xs text-[var(--muted)] text-center py-4">
            No entries yet. Paste the first email, meeting notes, or call transcript above.
          </p>
        ) : (
          logs.map((l) => {
            const cfg = TYPE_CONFIG[l.type as LogType] ?? { label: l.type, bg: "#F1ECE0", dot: "#9ca3af" };
            const isOpen = expanded[l._id] ?? false;
            return (
              <div
                key={l._id}
                className="rounded-lg border border-[var(--border)] bg-white overflow-hidden"
              >
                <div
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--hover-tan)]"
                  onClick={() => toggleRow(l._id)}
                >
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0"
                    style={{ backgroundColor: cfg.bg, color: "#1A1A1A" }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
                    {cfg.label}
                  </span>
                  <span className="flex-1 text-sm font-medium text-[var(--foreground)] truncate">
                    {l.title}
                  </span>
                  <span className="text-[11px] text-[var(--muted)] whitespace-nowrap">
                    {formatDate(l.occurredAt)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyRow(l.content, l._id);
                    }}
                    className={`p-1.5 rounded-md transition ${
                      copiedRow === l._id
                        ? "text-emerald-600"
                        : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--hover-tan)]"
                    }`}
                    title="Copy entry"
                  >
                    {copiedRow === l._id ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(l._id);
                    }}
                    className="p-1.5 rounded-md text-[var(--muted)] hover:text-rose-600 hover:bg-rose-50 transition"
                    title="Delete"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                    </svg>
                  </button>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className={`text-[var(--muted)] transition ${isOpen ? "rotate-180" : ""}`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
                {isOpen && (
                  <div className="border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--foreground)] whitespace-pre-wrap">
                    {l.content}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
