"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ServiceBoardEntry, ServiceBoardStatus, ServiceBoardCategory, TeamMember } from "@/types";
import MonthPicker from "./MonthPicker";
import HourCountdown from "./HourCountdown";
import ServiceBoardStatusBadge from "./ServiceBoardStatusBadge";
import ServiceBoardDetailPanel from "./ServiceBoardDetailPanel";

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
  const [entries, setEntries] = useState<ServiceBoardEntry[]>([]);
  const [teamMembers, setTeamMembers] = useState<Array<{ id: number; name: string; color: string; profilePicUrl: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<ServiceBoardEntry | null>(null);

  const categoryLabel = category === "google_ads" ? "Google Ads" : category === "seo" ? "SEO" : "Retainer";
  const isQuarterly = isQuarterlyMonth(month);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/service-board?category=${category}&month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
      }
    } catch (e) {
      console.error("Failed to fetch service board:", e);
    } finally {
      setLoading(false);
    }
  }, [category, month]);

  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/team");
      if (res.ok) {
        const data = await res.json();
        setTeamMembers(
          data
            .filter((m: TeamMember) => m.active)
            .map((m: TeamMember) => ({
              id: m.id,
              name: m.name,
              color: m.color || "#6B7280",
              profilePicUrl: m.profilePicUrl || "",
            }))
        );
      }
    } catch (e) {
      console.error("Failed to fetch team:", e);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  async function handleStatusChange(entryId: number, status: ServiceBoardStatus) {
    try {
      const res = await fetch(`/api/admin/service-board/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        let updated = await res.json();

        // Auto-generate email when status changes to report_ready
        if (status === "report_ready" && !updated.generatedEmail) {
          const emailRes = await fetch(`/api/admin/service-board/${entryId}/generate-email`, {
            method: "POST",
          });
          if (emailRes.ok) {
            updated = await emailRes.json();
          }
        }

        setEntries((prev) => prev.map((e) => (e.id === entryId ? updated : e)));
        if (selectedEntry?.id === entryId) setSelectedEntry(updated);
      }
    } catch (e) {
      console.error("Failed to update status:", e);
    }
  }

  async function handleSpecialistChange(entryId: number, specialistId: number | null) {
    try {
      const res = await fetch(`/api/admin/service-board/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialistId }),
      });
      if (res.ok) {
        const updated = await res.json();
        setEntries((prev) => prev.map((e) => (e.id === entryId ? updated : e)));
      }
    } catch (e) {
      console.error("Failed to update specialist:", e);
    }
  }

  async function handleSendEmail(entryId: number, isQuarterlyEmail: boolean) {
    try {
      const res = await fetch(`/api/admin/service-board/${entryId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isQuarterly: isQuarterlyEmail }),
      });
      if (res.ok) {
        const updated = await res.json();
        setEntries((prev) => prev.map((e) => (e.id === entryId ? updated : e)));
      }
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
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="px-6 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Hours</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Specialist</th>
                <th className="px-4 py-3 font-medium">Monthly Email</th>
                {isQuarterly && <th className="px-4 py-3 font-medium">Quarterly Email</th>}
                <th className="px-3 py-3 font-medium w-10 text-center" title="InsightPulse Dashboard">IP</th>
                <th className="px-3 py-3 font-medium w-10 text-center" title="Comments">
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="inline-block">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-gray-50 hover:bg-gray-50/50 transition cursor-pointer"
                  onClick={() => setSelectedEntry(entry)}
                >
                  {/* Client Name */}
                  <td className="px-6 py-3">
                    <span className="text-sm font-medium text-gray-900">{entry.clientName}</span>
                    <div className="text-xs text-gray-400">{entry.packageName}</div>
                  </td>

                  {/* Hours */}
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <HourCountdown
                      logged={entry.loggedHours || 0}
                      allocated={entry.includedHours || 0}
                      compact
                    />
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <ServiceBoardStatusBadge
                      status={entry.status}
                      onChange={(s) => handleStatusChange(entry.id, s)}
                    />
                  </td>

                  {/* Specialist */}
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
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
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <EmailAction
                      sentAt={entry.monthlyEmailSentAt}
                      status={entry.status}
                      onSend={() => handleSendEmail(entry.id, false)}
                      label="Monthly"
                    />
                  </td>

                  {/* Quarterly Email (only on quarterly months) */}
                  {isQuarterly && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <EmailAction
                        sentAt={entry.quarterlyEmailSentAt}
                        status={entry.status}
                        onSend={() => handleSendEmail(entry.id, true)}
                        label="Quarterly"
                      />
                    </td>
                  )}

                  {/* IP Link */}
                  <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    {entry.clientSlug ? (
                      <a
                        href={`/${entry.clientSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                        title={`Open ${entry.clientName} dashboard`}
                      >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                        </svg>
                      </a>
                    ) : (
                      <span className="text-gray-200">--</span>
                    )}
                  </td>

                  {/* Comments */}
                  <td className="px-3 py-3 text-center">
                    {entry.notes ? (
                      <span className="inline-flex items-center gap-0.5 text-xs text-gray-500">
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                        </svg>
                        {entry.commentCount || 1}
                      </span>
                    ) : (
                      <span className="text-gray-200">
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="inline-block">
                          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                        </svg>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail Panel */}
      {selectedEntry && (
        <ServiceBoardDetailPanel
          entry={selectedEntry}
          month={month}
          onClose={() => setSelectedEntry(null)}
          onUpdate={(updated) => {
            setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            setSelectedEntry(updated);
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
        className="flex items-center gap-1.5 text-xs hover:bg-gray-100 rounded-md px-1.5 py-1 transition"
      >
        {value && specialistName ? (
          <>
            {specialistPic ? (
              <img src={specialistPic} alt="" className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                style={{ backgroundColor: specialistColor || "#6B7280" }}
              >
                {specialistName.charAt(0)}
              </span>
            )}
            <span className="text-gray-700">{specialistName}</span>
          </>
        ) : (
          <span className="text-gray-400">Assign</span>
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
