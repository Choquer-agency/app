"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { TeamMember } from "@/types";
import { friendlyDate } from "@/lib/date-format";

const TiptapEditor = dynamic(() => import("./TiptapEditor"), { ssr: false });

interface SeoStrategyMonth {
  id: string;
  clientId: string;
  clientSlug: string;
  year: number;
  month: number;
  monthKey: string;
  status: "forecast" | "active" | "complete";
  rawContent: string;
  rawContentHash: string;
  lastEditedAt: number;
  lastEditedBy?: string;
  enrichmentState: "idle" | "queued" | "running" | "error";
  enrichmentQueuedAt?: number;
  enrichmentStartedAt?: number;
  enrichmentCompletedAt?: number;
  enrichmentError?: string;
  lastEnrichedHash?: string;
  quarterlyGoal?: string;
  clientApprovedAt?: number;
  clientApprovedBy?: string;
}

interface Props {
  clientId: string;
  clientSlug: string;
  clientName: string;
  teamMembers: TeamMember[];
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const ACTIVE_BADGE = "bg-[#BDFFE8] text-[#0d7a55]";
const BACKLOG_BADGE = "bg-amber-50 text-amber-700";
const PLANNED_BADGE = "bg-blue-50 text-blue-700";

const EMPTY_DOC = '{"type":"doc","content":[{"type":"paragraph"}]}';

function isEmptyDoc(raw: string): boolean {
  if (!raw) return true;
  if (raw === EMPTY_DOC) return true;
  try {
    const doc = JSON.parse(raw);
    if (!doc?.content?.length) return true;
    if (
      doc.content.length === 1 &&
      doc.content[0].type === "paragraph" &&
      !doc.content[0].content?.length
    )
      return true;
  } catch {}
  return false;
}

export default function SeoStrategyTab({ clientId, clientSlug, clientName, teamMembers }: Props) {
  const [months, setMonths] = useState<SeoStrategyMonth[]>([]);
  const [syncing, setSyncing] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openYears, setOpenYears] = useState<Set<number>>(() => new Set([new Date().getFullYear()]));
  const [unlockedMonths, setUnlockedMonths] = useState<Set<string>>(new Set());
  const [enriching, setEnriching] = useState<Set<string>>(new Set());

  const mentionItems = useMemo(
    () =>
      teamMembers.map((m) => ({
        id: m.id,
        label: m.name,
        profilePicUrl: m.profilePicUrl,
        color: m.color,
      })),
    [teamMembers]
  );

  const fetchMonths = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/admin/seo-strategy/${clientId}/months`);
      if (res.ok) {
        const data: SeoStrategyMonth[] = await res.json();
        setMonths(data);
        setLoadError(null);
      } else {
        try {
          const err = await res.json();
          setLoadError(err?.error || `Request failed (${res.status})`);
        } catch {
          setLoadError(`Request failed (${res.status})`);
        }
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setSyncing(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchMonths();
  }, [fetchMonths]);

  const monthsByYear = useMemo(() => {
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1;

    const byKey = new Map<string, SeoStrategyMonth>();
    for (const m of months) byKey.set(m.monthKey, m);

    function ensure(y: number, m: number, status: SeoStrategyMonth["status"]) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (byKey.has(key)) return;
      byKey.set(key, {
        id: `placeholder-${key}`,
        clientId,
        clientSlug,
        year: y,
        month: m,
        monthKey: key,
        status,
        rawContent: EMPTY_DOC,
        rawContentHash: "",
        lastEditedAt: 0,
        enrichmentState: "idle",
      });
    }

    // Current + next 3 forecast slots
    for (let i = 0; i <= 3; i++) {
      let m = todayMonth + i;
      let y = todayYear;
      while (m > 12) {
        m -= 12;
        y += 1;
      }
      ensure(y, m, i === 0 ? "active" : "forecast");
    }

    // Testing: surface all of last calendar year as backlog placeholders
    for (let m = 1; m <= 12; m++) ensure(todayYear - 1, m, "complete");

    const map = new Map<number, SeoStrategyMonth[]>();
    for (const m of byKey.values()) {
      if (!map.has(m.year)) map.set(m.year, []);
      map.get(m.year)!.push(m);
    }

    // Within each year, sort so the current month leads, then forward, then descending past months
    for (const [year, list] of map) {
      if (year === todayYear) {
        list.sort((a, b) => {
          const ad = a.month >= todayMonth ? a.month - todayMonth : 100 + (todayMonth - a.month);
          const bd = b.month >= todayMonth ? b.month - todayMonth : 100 + (todayMonth - b.month);
          return ad - bd;
        });
      } else {
        list.sort((a, b) => b.month - a.month);
      }
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [months, clientId, clientSlug]);

  function toggleYear(year: number) {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }

  function toggleUnlock(monthKey: string) {
    setUnlockedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  }

  async function reEnrich(monthKey: string) {
    setEnriching((prev) => new Set(prev).add(monthKey));
    try {
      const res = await fetch(
        `/api/admin/seo-strategy/${clientId}/months/${monthKey}/enrich-now`,
        { method: "POST" }
      );
      if (res.ok) await fetchMonths();
    } finally {
      setEnriching((prev) => {
        const next = new Set(prev);
        next.delete(monthKey);
        return next;
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--foreground)]">
            {clientName} — SEO Strategy
          </h3>
          <p className="text-xs text-[var(--muted)] mt-1">
            Edit any month below. Saves auto every 30 seconds and re-enriches the dashboard 4 minutes after your last edit.
          </p>
        </div>
        {syncing && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 shrink-0">
            Syncing…
          </span>
        )}
      </div>

      {loadError && (
        <div className="text-xs px-3 py-2 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
          Couldn&apos;t load saved months ({loadError}). Showing the editor for the current month and forecast slots — start writing and the row will be created on save. If this persists, make sure <code className="font-mono">npx convex dev</code> is running so the new schema is deployed.
        </div>
      )}

      <div>
        {monthsByYear.map(([year, list], idx) => {
          const open = openYears.has(year);
          return (
            <div
              key={year}
              className={idx > 0 ? "border-t border-[var(--border)] pt-4 mt-4" : ""}
            >
              <button
                onClick={() => toggleYear(year)}
                className="w-full flex items-center justify-between py-2 hover:opacity-80 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold text-[var(--foreground)]">{year}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {list.length} {list.length === 1 ? "month" : "months"}
                  </span>
                </div>
                <span className="text-sm text-[var(--muted)]">{open ? "▾" : "▸"}</span>
              </button>

              {open && (
                <div className="space-y-2 mt-2">
                  {list.map((m) => (
                    <MonthSection
                      key={m.monthKey}
                      month={m}
                      unlocked={unlockedMonths.has(m.monthKey)}
                      onToggleUnlock={() => toggleUnlock(m.monthKey)}
                      onReEnrich={() => reEnrich(m.monthKey)}
                      enriching={enriching.has(m.monthKey)}
                      mentionItems={mentionItems}
                      clientId={clientId}
                      clientSlug={clientSlug}
                      onSaved={fetchMonths}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface MonthSectionProps {
  month: SeoStrategyMonth;
  unlocked: boolean;
  onToggleUnlock: () => void;
  onReEnrich: () => void;
  enriching: boolean;
  mentionItems: { id: string; label: string; profilePicUrl?: string; color?: string }[];
  clientId: string;
  clientSlug: string;
  onSaved: () => void;
}

function MonthSection({
  month,
  unlocked,
  onToggleUnlock,
  onReEnrich,
  enriching,
  mentionItems,
  clientId,
  clientSlug,
  onSaved,
}: MonthSectionProps) {
  const [content, setContent] = useState(month.rawContent);
  const [savedAt, setSavedAt] = useState(month.lastEditedAt);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(month.status === "active");
  const [goal, setGoal] = useState(month.quarterlyGoal ?? "");
  const [savingGoal, setSavingGoal] = useState(false);
  const [approved, setApproved] = useState(!!month.clientApprovedAt);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goalDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef(month.rawContent);
  const latestGoalRef = useRef(month.quarterlyGoal ?? "");

  useEffect(() => {
    setContent(month.rawContent);
    latestRef.current = month.rawContent;
    setSavedAt(month.lastEditedAt);
  }, [month.rawContent, month.lastEditedAt]);

  useEffect(() => {
    setGoal(month.quarterlyGoal ?? "");
    latestGoalRef.current = month.quarterlyGoal ?? "";
  }, [month.quarterlyGoal]);

  useEffect(() => {
    setApproved(!!month.clientApprovedAt);
  }, [month.clientApprovedAt]);

  const editable = month.status !== "complete" || unlocked;
  const isActive = month.status === "active";
  const isFuture = month.status === "forecast";
  const isEmpty = isEmptyDoc(content);
  const showBacklog = !isActive && isEmpty;
  const showPlanned = isFuture && !isEmpty;
  const isPlaceholder = month.id.startsWith("placeholder-");

  const flushSave = useCallback(
    async (raw: string) => {
      setSaving(true);
      try {
        const res = await fetch(
          `/api/admin/seo-strategy/${clientId}/months/${month.monthKey}/save`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rawContent: raw }),
          }
        );
        if (res.ok) {
          const saved: SeoStrategyMonth = await res.json();
          setSavedAt(saved.lastEditedAt);
          onSaved();
        }
      } finally {
        setSaving(false);
      }
    },
    [clientId, month.monthKey, onSaved]
  );

  function handleChange(json: string) {
    setContent(json);
    latestRef.current = json;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (latestRef.current !== month.rawContent) flushSave(latestRef.current);
    }, 30000);
  }

  const flushGoal = useCallback(
    async (value: string) => {
      setSavingGoal(true);
      try {
        await fetch(
          `/api/admin/seo-strategy/${clientId}/months/${month.monthKey}/goal`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quarterlyGoal: value }),
          }
        );
        onSaved();
      } finally {
        setSavingGoal(false);
      }
    },
    [clientId, month.monthKey, onSaved]
  );

  function handleGoalChange(value: string) {
    setGoal(value);
    latestGoalRef.current = value;
    if (goalDebounceRef.current) clearTimeout(goalDebounceRef.current);
    goalDebounceRef.current = setTimeout(() => {
      if (latestGoalRef.current !== (month.quarterlyGoal ?? "")) {
        flushGoal(latestGoalRef.current);
      }
    }, 1500);
  }

  useEffect(() => {
    function beforeUnload() {
      if (latestRef.current !== month.rawContent) {
        try {
          navigator.sendBeacon(
            `/api/admin/seo-strategy/${clientId}/months/${month.monthKey}/save`,
            new Blob([JSON.stringify({ rawContent: latestRef.current })], {
              type: "application/json",
            })
          );
        } catch {}
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (latestRef.current !== month.rawContent) flushSave(latestRef.current);
      if (goalDebounceRef.current) clearTimeout(goalDebounceRef.current);
      if (latestGoalRef.current !== (month.quarterlyGoal ?? "")) {
        flushGoal(latestGoalRef.current);
      }
    };
  }, [clientId, month.monthKey, month.rawContent, month.quarterlyGoal, flushSave, flushGoal]);

  const hasUnsavedEdits = content !== month.rawContent;
  const isDirty =
    month.rawContentHash !== (month.lastEnrichedHash ?? "") || hasUnsavedEdits;
  const showReEnrich = !isPlaceholder && !isEmpty && isDirty;

  async function handleReEnrichClick() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (latestRef.current !== month.rawContent) {
      await flushSave(latestRef.current);
    }
    onReEnrich();
  }

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-white">
      <div className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 transition">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-3 min-w-0 text-left"
        >
          <h4 className="text-sm font-semibold text-[var(--foreground)] truncate">
            {MONTH_NAMES[month.month - 1]} {month.year}
          </h4>
          {isActive && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ACTIVE_BADGE}`}>
              Active
            </span>
          )}
          {showPlanned && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${PLANNED_BADGE}`}>
              Planned
            </span>
          )}
          {showBacklog && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${BACKLOG_BADGE}`}>
              Backlog
            </span>
          )}
          {approved && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700">
              Client approved
            </span>
          )}
          {saving && (
            <span className="text-[10px] text-[var(--muted)]">Saving…</span>
          )}
          {!saving && !isEmpty && savedAt > 0 && (
            <span className="text-[10px] text-[var(--muted)] truncate">
              Saved {friendlyDate(new Date(savedAt).toISOString())}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {showReEnrich && (
            <button
              onClick={handleReEnrichClick}
              disabled={enriching || month.enrichmentState === "running" || saving}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 transition"
            >
              {saving
                ? "Saving…"
                : enriching || month.enrichmentState === "running"
                ? "Enriching…"
                : "Re-enrich now"}
            </button>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-[var(--muted)] px-1"
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? "▾" : "▸"}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-[var(--border)] p-4 space-y-3">
          {/* Quarterly goal */}
          <div className="flex items-baseline gap-2">
            <label className="text-xs font-semibold text-[var(--foreground)] shrink-0">
              Quarterly goal:
            </label>
            <input
              type="text"
              value={goal}
              onChange={(e) => handleGoalChange(e.target.value)}
              disabled={!editable}
              placeholder="e.g. Increase organic clicks 10% over Q2"
              className="flex-1 text-sm bg-transparent border-b border-transparent focus:border-[var(--accent)] focus:outline-none px-0 py-1 disabled:opacity-50"
            />
            {savingGoal && <span className="text-[10px] text-[var(--muted)]">Saving…</span>}
          </div>

          {/* Approval timestamp (admin read-only — client approves from their dashboard) */}
          {approved && month.clientApprovedAt && (
            <p className="text-[11px] text-[var(--muted)]">
              Client approved on {friendlyDate(new Date(month.clientApprovedAt).toISOString())}
            </p>
          )}
          {month.status === "complete" && !isEmpty && (
            <div className="flex justify-end">
              <button
                onClick={onToggleUnlock}
                className="text-xs px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-gray-50 transition"
              >
                {unlocked ? "Lock" : "Edit"}
              </button>
            </div>
          )}

          {month.enrichmentError && (
            <div className="text-xs px-3 py-2 rounded-lg bg-red-50 text-red-700">
              Last enrichment failed: {month.enrichmentError}
            </div>
          )}

          <TiptapEditor
            content={content}
            onChange={handleChange}
            editable={editable}
            mentionItems={mentionItems}
            placeholder={
              showBacklog
                ? "Backlog — fill in tasks, deliverables, approvals, and metric callouts."
                : "Write tasks, deliverables, approvals, and metric callouts here."
            }
          />
        </div>
      )}
    </div>
  );
}
