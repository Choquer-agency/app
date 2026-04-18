"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ServiceBoardEntry, ServiceBoardStatus, ServiceBoardCategory, TeamMember } from "@/types";
import MonthPicker from "./MonthPicker";
import HourCountdown from "./HourCountdown";
import ServiceBoardStatusBadge from "./ServiceBoardStatusBadge";
import ServiceBoardDetailPanel from "./ServiceBoardDetailPanel";
import TimeTracker from "./TimeTracker";
import { useTeamMembers } from "@/hooks/useTeamMembers";

// Wrapper that renders TimeTracker when a service ticket exists, or a visually
// identical idle state (play + clock icons) that lazily creates the ticket on click.
function ServiceTimeTracker({
  entryId,
  initialTicketId,
  onTimerChange,
}: {
  entryId: string;
  initialTicketId: string | null;
  onTimerChange?: () => void;
}) {
  const [ticketId, setTicketId] = useState<string | null>(initialTicketId);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    setTicketId(initialTicketId);
  }, [initialTicketId]);

  if (ticketId) {
    return (
      <TimeTracker
        ticketId={ticketId as unknown as string}
        onTimerChange={onTimerChange}
      />
    );
  }

  // Idle state when no service ticket exists yet — matches TimeTracker's idle
  // visual (play icon + clock icon, both icon-only). Clicking play lazily
  // creates the ticket via the existing start_timer action.
  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (starting) return;
    setStarting(true);
    try {
      const res = await fetch(`/api/admin/service-board/${entryId}/time-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start_timer" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ticketId) {
          setTicketId(data.ticketId);
          onTimerChange?.();
        }
      }
    } catch {} finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={handleStart}
        disabled={starting}
        className="flex items-center text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-gray-50 transition rounded-md p-1 disabled:opacity-50"
        title="Start timer"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
        </svg>
      </button>
      <div className="flex items-center text-[var(--muted)] rounded-md p-1 opacity-60">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      </div>
    </div>
  );
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function isQuarterlyMonth(month: string): boolean {
  const d = new Date(month + "T12:00:00");
  const m = d.getMonth();
  return m === 0 || m === 3 || m === 6 || m === 9;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface ServiceBoardProps {
  category: ServiceBoardCategory;
}

export default function ServiceBoard({ category }: ServiceBoardProps) {
  const [month, setMonth] = useState(getCurrentMonth);
  const { teamMembers: rawTeamMembers } = useTeamMembers();
  const teamMembers = rawTeamMembers.map((m) => ({
    id: m.id,
    name: m.name,
    color: m.color || "#6B7280",
    profilePicUrl: m.profilePicUrl || "",
  }));
  const [selectedEntry, setSelectedEntry] = useState<ServiceBoardEntry | null>(null);
  const [lostOpen, setLostOpen] = useState(false);
  const [hoursMap, setHoursMap] = useState<Record<string, { loggedHours?: number; percentUsed?: number; hourStatus?: string }>>({});

  const categoryLabel = category === "google_ads" ? "Google Ads" : category === "seo" ? "SEO" : "Retainer";
  const isQuarterly = isQuarterlyMonth(month);

  // Real-time Convex subscription for entry data (status, specialist, notes update instantly)
  const rawEntries = useQuery(api.serviceBoardEntries.list, { category, month });

  // Previous month — for "lost clients" comparison
  const prevMonth = (() => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  })();
  const prevRawEntries = useQuery(api.serviceBoardEntries.list, { category, month: prevMonth });
  const loading = rawEntries === undefined;

  // Map Convex docs to ServiceBoardEntry type
  const entries: ServiceBoardEntry[] = (rawEntries ?? []).map((doc: any) => ({
    id: doc._id,
    clientId: doc.clientId,
    clientPackageId: doc.clientPackageId,
    category: doc.category as ServiceBoardCategory,
    month: doc.month ?? "",
    status: doc.status as ServiceBoardStatus,
    specialistId: doc.specialistId ?? null,
    monthlyEmailSentAt: doc.monthlyEmailSentAt ?? null,
    quarterlyEmailSentAt: doc.quarterlyEmailSentAt ?? null,
    notes: doc.notes ?? "",
    createdAt: doc._creationTime ? new Date(doc._creationTime).toISOString() : "",
    updatedAt: doc._creationTime ? new Date(doc._creationTime).toISOString() : "",
    clientName: doc.clientName ?? undefined,
    clientSlug: doc.clientSlug ?? undefined,
    clientNotionPageUrl: doc.clientNotionPageUrl ?? undefined,
    serviceTicketId: doc.serviceTicketId ?? null,
    packageName: doc.packageName ?? undefined,
    includedHours: doc.includedHours ?? undefined,
    specialistName: doc.specialistName ?? undefined,
    specialistColor: doc.specialistColor ?? undefined,
    specialistProfilePicUrl: doc.specialistProfilePicUrl ?? undefined,
    generatedEmail: doc.generatedEmail ?? undefined,
    // Merge hours from REST fetch
    loggedHours: hoursMap[doc._id]?.loggedHours ?? 0,
  })).filter(
    (e) =>
      e.clientName &&
      e.clientName.trim().length > 0 &&
      // Exclude orphan entries whose underlying clientPackage was deleted
      e.packageName &&
      e.packageName.trim().length > 0
  );

  // Clients present last month but missing this month (deduped by clientId, real packages only)
  const prevEntries = ((prevRawEntries ?? []) as any[]).filter(
    (e) => e.clientName && e.packageName
  );
  const currentClientIds = new Set(entries.map((e) => String(e.clientId)));
  const lostClients = prevEntries
    .filter((e) => !currentClientIds.has(String(e.clientId)))
    .map((e) => ({
      id: String(e.clientId),
      name: e.clientName as string,
      slug: e.clientSlug as string | undefined,
      packageName: e.packageName as string | undefined,
    }))
    .filter((c, idx, arr) => arr.findIndex((x) => x.id === c.id) === idx);

  // Keep selectedEntry in sync with Convex updates
  useEffect(() => {
    if (selectedEntry && entries.length > 0) {
      const fresh = entries.find((e) => e.id === selectedEntry.id);
      if (fresh && JSON.stringify(fresh) !== JSON.stringify(selectedEntry)) {
        setSelectedEntry(fresh);
      }
    }
  }, [entries, selectedEntry]);

  // Fetch hours via REST (also ensures entries exist for the month)
  const fetchHours = useCallback(() => {
    fetch(`/api/admin/service-board?category=${category}&month=${month}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: any[]) => {
        const map: Record<string, { loggedHours?: number; percentUsed?: number; hourStatus?: string }> = {};
        for (const entry of data) {
          map[entry.id] = {
            loggedHours: entry.loggedHours,
            percentUsed: entry.percentUsed,
            hourStatus: entry.hourStatus,
          };
        }
        setHoursMap(map);
      })
      .catch(() => {});
  }, [category, month]);

  useEffect(() => {
    fetchHours();
  }, [fetchHours]);

  // Re-fetch hours when the tab regains focus (another user may have logged time elsewhere)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchHours();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchHours]);

  async function handleStatusChange(entryId: string, status: ServiceBoardStatus) {
    try {
      const res = await fetch(`/api/admin/service-board/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const updated = await res.json();
        // Auto-generate email when status changes to report_ready
        if (status === "report_ready" && !updated.generatedEmail) {
          await fetch(`/api/admin/service-board/${entryId}/generate-email`, {
            method: "POST",
          });
        }
        // No manual state update — Convex subscription auto-updates
        if (selectedEntry?.id === entryId) {
          setSelectedEntry(entries.find((e) => e.id === entryId) ?? null);
        }
      }
    } catch (e) {
      console.error("Failed to update status:", e);
    }
  }

  async function handleSpecialistChange(entryId: string, specialistId: number | null) {
    try {
      await fetch(`/api/admin/service-board/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialistId }),
      });
      // No manual state update — Convex subscription auto-updates
    } catch (e) {
      console.error("Failed to update specialist:", e);
    }
  }

  async function handleSendEmail(entryId: string, isQuarterlyEmail: boolean) {
    try {
      await fetch(`/api/admin/service-board/${entryId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isQuarterly: isQuarterlyEmail }),
      });
      // No manual state update — Convex subscription auto-updates
    } catch (e) {
      console.error("Failed to mark email sent:", e);
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-gray-900">{categoryLabel}</h1>
          <MonthPicker value={month} onChange={setMonth} />
        </div>
        <div className="text-sm text-gray-500">
          {entries.length} client{entries.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="mb-2">
              <path d="M12 9v3m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm">No clients with an active {categoryLabel} package</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Client</th>
                <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap w-[110px]">Time Tracked</th>
                <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap w-[130px]">Hours</th>
                <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap w-[130px]">Status</th>
                <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap w-[70px]">Specialist</th>
                <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap w-[120px]">Monthly Email</th>
                {isQuarterly && <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap w-[120px]">Quarterly Email</th>}
                <th className="px-2 py-2.5 text-center font-medium text-[var(--muted)] text-xs w-10" title="InsightPulse Dashboard">IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-[var(--border)] hover:bg-[var(--hover-tan)] transition cursor-pointer"
                  onClick={() => setSelectedEntry(entry)}
                >
                  {/* Client Name */}
                  <td className="px-2 py-3 whitespace-nowrap">
                    <div className="text-sm font-medium text-[var(--foreground)]">{entry.clientName}</div>
                    <div className="text-xs text-[var(--muted)]">{entry.packageName}</div>
                  </td>

                  {/* Time Tracked */}
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <ServiceTimeTracker entryId={entry.id} initialTicketId={entry.serviceTicketId ?? null} onTimerChange={fetchHours} />
                  </td>

                  {/* Hours */}
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <HourCountdown
                      logged={entry.loggedHours || 0}
                      allocated={entry.includedHours || 0}
                      compact
                    />
                  </td>

                  {/* Status */}
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <ServiceBoardStatusBadge
                      status={entry.status}
                      onChange={(s) => handleStatusChange(entry.id, s)}
                    />
                  </td>

                  {/* Specialist */}
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <SpecialistDropdown
                      value={entry.specialistId}
                      specialistName={entry.specialistName}
                      specialistColor={entry.specialistColor}
                      specialistPic={entry.specialistProfilePicUrl}
                      teamMembers={teamMembers}
                      onChange={(id) => handleSpecialistChange(entry.id, id)}
                    />
                  </td>

                  {/* Monthly Email */}
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <EmailAction
                      sentAt={entry.monthlyEmailSentAt}
                      status={entry.status}
                      onSend={() => handleSendEmail(entry.id, false)}
                      label="Monthly"
                    />
                  </td>

                  {/* Quarterly Email (only on quarterly months) */}
                  {isQuarterly && (
                    <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                      <EmailAction
                        sentAt={entry.quarterlyEmailSentAt}
                        status={entry.status}
                        onSend={() => handleSendEmail(entry.id, true)}
                        label="Quarterly"
                      />
                    </td>
                  )}

                  {/* IP Link */}
                  <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    {entry.clientSlug ? (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const url = `${window.location.origin}/${entry.clientSlug}`;
                          const tauri = (window as any).__TAURI__;
                          if (tauri?.core?.invoke) {
                            try {
                              await tauri.core.invoke("plugin:opener|open_url", { url });
                              return;
                            } catch {}
                          }
                          window.open(url, "_blank", "noopener,noreferrer");
                        }}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                        title={`Open ${entry.clientName} dashboard`}
                      >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                        </svg>
                      </button>
                    ) : (
                      <span className="text-gray-200">--</span>
                    )}
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Lost clients from last month */}
      {lostClients.length > 0 && (
        <div className="mt-4 bg-white rounded-xl border border-[var(--border)] overflow-hidden">
          <button
            type="button"
            onClick={() => setLostOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-[var(--foreground)] hover:bg-[var(--hover-tan)] transition"
          >
            <span className="inline-flex items-center gap-2">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className={`text-[var(--muted)] transition ${lostOpen ? "rotate-90" : ""}`}
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
              <span className="font-medium">Lost this month</span>
              <span className="text-xs text-[var(--muted)]">
                ({lostClients.length})
              </span>
            </span>
            <span className="text-xs text-[var(--muted)]">
              On this list last month but not this month
            </span>
          </button>
          {lostOpen && (
            <ul className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
              {lostClients.map((c) => (
                <li key={c.id}>
                  <a
                    href={`/admin/crm/${c.id}`}
                    className="flex items-center justify-between px-4 py-3 text-sm hover:bg-[var(--hover-tan)] transition"
                  >
                    <span className="text-[var(--foreground)] font-medium">{c.name}</span>
                    {c.packageName && (
                      <span className="text-xs text-[var(--muted)]">{c.packageName}</span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Detail Panel */}
      {selectedEntry && (
        <ServiceBoardDetailPanel
          entry={selectedEntry}
          month={month}
          onClose={() => setSelectedEntry(null)}
          onUpdate={() => {
            // Convex subscription auto-updates entries — just refresh selectedEntry reference
            const fresh = entries.find((e) => e.id === selectedEntry.id);
            if (fresh) setSelectedEntry(fresh);
          }}
        />
      )}
    </div>
  );
}

/* ── Specialist Dropdown ── */

function SpecialistDropdown({
  value,
  specialistName,
  specialistColor,
  specialistPic,
  teamMembers,
  onChange,
}: {
  value: number | null;
  specialistName?: string;
  specialistColor?: string;
  specialistPic?: string;
  teamMembers: Array<{ id: number; name: string; color: string; profilePicUrl: string }>;
  onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center hover:opacity-80 rounded-full transition"
        title={specialistName || "Assign specialist"}
      >
        {value && specialistName ? (
          specialistPic ? (
            <img src={specialistPic} alt={specialistName} className="w-7 h-7 rounded-full object-cover border border-[var(--border)]" />
          ) : (
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
              style={{ backgroundColor: specialistColor || "#6B7280" }}
            >
              {specialistName.charAt(0)}
            </span>
          )
        ) : (
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-dashed border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)] transition">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
            >
              Unassign
            </button>
            {teamMembers.map((m) => (
              <button
                key={m.id}
                onClick={() => { onChange(m.id); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 ${
                  m.id === value ? "font-semibold" : ""
                }`}
              >
                {m.profilePicUrl ? (
                  <img src={m.profilePicUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
                ) : (
                  <span
                    className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                    style={{ backgroundColor: m.color }}
                  >
                    {m.name.charAt(0)}
                  </span>
                )}
                <span className="text-gray-700">{m.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Email Action Button ── */

function EmailAction({
  sentAt,
  status,
  onSend,
  label,
}: {
  sentAt: string | null;
  status: ServiceBoardStatus;
  onSend: () => void;
  label: string;
}) {
  if (sentAt) {
    return (
      <div className="flex items-center gap-1.5">
        <svg width="14" height="14" fill="none" stroke="#10B981" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-xs text-emerald-600 font-medium">
          Sent {formatDate(sentAt)}
        </span>
      </div>
    );
  }

  if (status === "report_ready" || status === "email_sent") {
    return (
      <button
        onClick={onSend}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
      >
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        Send {label}
      </button>
    );
  }

  return <span className="text-xs text-gray-300">--</span>;
}
