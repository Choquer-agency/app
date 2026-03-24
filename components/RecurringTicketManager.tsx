"use client";

import { useState, useEffect, useCallback } from "react";
import { RecurringTicketTemplate, TeamMember, RecurrenceRule } from "@/types";
import RecurringTemplateModal from "./RecurringTemplateModal";
import { friendlyDate } from "@/lib/date-format";

interface RecurringTicketManagerProps {
  clientId?: number;
  clientName?: string;
  teamMembers: TeamMember[];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatRecurrence(rule: RecurrenceRule, day: number): string {
  switch (rule) {
    case "weekly":
      return `Weekly on ${DAY_NAMES[day] || "Mon"}`;
    case "biweekly":
      return `Every 2 weeks on ${DAY_NAMES[day] || "Mon"}`;
    case "monthly":
      return `Monthly on the ${ordinal(day)}`;
    case "quarterly":
      return `Quarterly on the ${ordinal(day)}`;
    default:
      return rule;
  }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatDate(dateStr: string): string {
  return friendlyDate(dateStr);
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-gray-500 bg-gray-100",
  normal: "text-blue-700 bg-blue-50",
  high: "text-orange-700 bg-orange-50",
  urgent: "text-red-700 bg-red-50",
};

export default function RecurringTicketManager({
  clientId,
  clientName,
  teamMembers,
}: RecurringTicketManagerProps) {
  const [templates, setTemplates] = useState<RecurringTicketTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTemplate, setEditTemplate] = useState<RecurringTicketTemplate | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const url = clientId
        ? `/api/admin/recurring?clientId=${clientId}`
        : "/api/admin/recurring";
      const res = await fetch(url);
      if (res.ok) {
        setTemplates(await res.json());
      }
    } catch {
      console.error("Failed to fetch recurring templates");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  async function handleToggleActive(template: RecurringTicketTemplate) {
    try {
      const res = await fetch(`/api/admin/recurring/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !template.active }),
      });
      if (res.ok) {
        setTemplates((prev) =>
          prev.map((t) =>
            t.id === template.id ? { ...t, active: !t.active } : t
          )
        );
      }
    } catch {
      console.error("Failed to toggle template");
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`/api/admin/recurring/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== id));
        setDeleteConfirm(null);
      }
    } catch {
      console.error("Failed to delete template");
    }
  }

  function handleSaved(saved: RecurringTicketTemplate) {
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    setShowModal(false);
    setEditTemplate(undefined);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          {!clientId && (
            <p className="text-sm text-[var(--muted)]">
              Auto-create tickets on a schedule for retainer clients
            </p>
          )}
        </div>
        <button
          onClick={() => {
            setEditTemplate(undefined);
            setShowModal(true);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-[var(--accent)] hover:opacity-90 rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Recurring Template
        </button>
      </div>

      {/* Table */}
      {templates.length === 0 ? (
        <div className="text-center py-16 text-[var(--muted)]">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
          </svg>
          <p className="text-sm font-medium">No recurring templates yet</p>
          <p className="text-xs mt-1">Create one to auto-generate tickets on a schedule</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 border-b border-[var(--border)]">
                <th className="text-left px-4 py-2.5 font-medium text-[var(--muted)]">Title</th>
                {!clientId && (
                  <th className="text-left px-4 py-2.5 font-medium text-[var(--muted)]">Client</th>
                )}
                <th className="text-left px-4 py-2.5 font-medium text-[var(--muted)]">Recurrence</th>
                <th className="text-left px-4 py-2.5 font-medium text-[var(--muted)]">Next Run</th>
                <th className="text-left px-4 py-2.5 font-medium text-[var(--muted)]">Priority</th>
                <th className="text-left px-4 py-2.5 font-medium text-[var(--muted)]">Assignees</th>
                <th className="text-center px-4 py-2.5 font-medium text-[var(--muted)]">Active</th>
                <th className="text-right px-4 py-2.5 font-medium text-[var(--muted)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr
                  key={t.id}
                  className={`border-b border-[var(--border)] last:border-b-0 hover:bg-gray-50/50 transition ${
                    !t.active ? "opacity-50" : ""
                  }`}
                >
                  {/* Title */}
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--foreground)]">{t.title}</div>
                    {t.projectName && (
                      <div className="text-xs text-[var(--muted)] mt-0.5">{t.projectName}</div>
                    )}
                  </td>

                  {/* Client */}
                  {!clientId && (
                    <td className="px-4 py-3 text-[var(--foreground)]">
                      {t.clientName || "—"}
                    </td>
                  )}

                  {/* Recurrence */}
                  <td className="px-4 py-3 text-[var(--foreground)]">
                    {formatRecurrence(t.recurrenceRule, t.recurrenceDay)}
                  </td>

                  {/* Next Run */}
                  <td className="px-4 py-3 text-[var(--foreground)]">
                    {formatDate(t.nextCreateAt)}
                  </td>

                  {/* Priority */}
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PRIORITY_COLORS[t.priority] || ""}`}>
                      {t.priority}
                    </span>
                  </td>

                  {/* Assignees */}
                  <td className="px-4 py-3">
                    {t.assignees && t.assignees.length > 0 ? (
                      <div className="flex items-center -space-x-1.5">
                        {t.assignees.slice(0, 3).map((a) => (
                          <div
                            key={a.teamMemberId}
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 overflow-hidden border-2 border-white"
                            style={{
                              backgroundColor: a.memberColor || "#e5e7eb",
                              color: a.memberColor ? "#fff" : "#6b7280",
                            }}
                            title={a.memberName}
                          >
                            {a.memberProfilePicUrl ? (
                              <img src={a.memberProfilePicUrl} alt={a.memberName || ""} className="w-full h-full object-cover" />
                            ) : (
                              (a.memberName || "")
                                .split(" ")
                                .map((w) => w[0])
                                .join("")
                                .toUpperCase()
                                .slice(0, 2)
                            )}
                          </div>
                        ))}
                        {t.assignees.length > 3 && (
                          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600 border-2 border-white">
                            +{t.assignees.length - 3}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>

                  {/* Active toggle */}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleActive(t)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        t.active ? "bg-[var(--accent)]" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          t.active ? "translate-x-[18px]" : "translate-x-[3px]"
                        }`}
                      />
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditTemplate(t);
                          setShowModal(true);
                        }}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-[var(--muted)] hover:text-[var(--foreground)] transition"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                        </svg>
                      </button>
                      {deleteConfirm === t.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(t.id)}
                            className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-2 py-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] rounded hover:bg-gray-100 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(t.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-[var(--muted)] hover:text-red-600 transition"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <RecurringTemplateModal
          teamMembers={teamMembers}
          template={editTemplate}
          defaultClientId={clientId}
          defaultClientName={clientName}
          onClose={() => {
            setShowModal(false);
            setEditTemplate(undefined);
          }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
