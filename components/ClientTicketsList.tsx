"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import TicketStatusBadge from "./TicketStatusBadge";

type SortField = "title" | "status" | "dueDate" | "priority";

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};
const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};
const PRIORITY_DOTS: Record<string, string> = {
  urgent: "#dc2626",
  high: "#f97316",
  normal: "#3b82f6",
  low: "#9ca3af",
};

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ClientTicketsList({ clientId }: { clientId: number | string }) {
  const router = useRouter();
  const { teamMembers } = useTeamMembers(false);
  const ticketDocs = useQuery(api.tickets.list, {
    clientId: clientId as Id<"clients">,
    archived: false,
    limit: 500,
  });
  const [sortField, setSortField] = useState<SortField>("dueDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showCompleted, setShowCompleted] = useState(false);

  const memberMap = useMemo(() => {
    const m = new Map<string, { name: string; color?: string; profilePicUrl?: string }>();
    for (const tm of teamMembers) {
      m.set(String((tm as any).id ?? (tm as any)._id), {
        name: tm.name ?? "Unknown",
        color: (tm as any).color,
        profilePicUrl: (tm as any).profilePicUrl,
      });
    }
    return m;
  }, [teamMembers]);

  const tickets = useMemo(() => {
    const all = (ticketDocs ?? []) as any[];
    const filtered = showCompleted ? all : all.filter((t) => t.status !== "complete" && t.status !== "closed");
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") cmp = (a.title ?? "").localeCompare(b.title ?? "");
      else if (sortField === "status") cmp = (a.status ?? "").localeCompare(b.status ?? "");
      else if (sortField === "dueDate") {
        const ad = a.dueDate ?? "9999-12-31";
        const bd = b.dueDate ?? "9999-12-31";
        cmp = ad.localeCompare(bd);
      } else if (sortField === "priority") {
        cmp = (PRIORITY_ORDER[a.priority ?? "normal"] ?? 99) - (PRIORITY_ORDER[b.priority ?? "normal"] ?? 99);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [ticketDocs, sortField, sortDir, showCompleted]);

  function toggleSort(f: SortField) {
    if (sortField === f) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortField(f);
      setSortDir("asc");
    }
  }

  if (ticketDocs === undefined) {
    return <div className="text-sm text-[var(--muted)] text-center py-8">Loading tickets…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">
          Tickets ({tickets.length})
        </h3>
        <label className="flex items-center gap-2 text-xs text-[var(--muted)] cursor-pointer">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            className="accent-[var(--accent)] w-3.5 h-3.5"
          />
          Include completed
        </label>
      </div>

      {tickets.length === 0 ? (
        <p className="text-sm text-[var(--muted)] text-center py-8">
          No {showCompleted ? "" : "open "}tickets for this client.
        </p>
      ) : (
        <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                {(
                  [
                    { key: "title" as const, label: "Ticket", align: "left", width: "" },
                    { key: "status" as const, label: "Status", align: "left", width: "w-[140px]" },
                    { key: null, label: "Assignee", align: "left", width: "w-[120px]" },
                    { key: "dueDate" as const, label: "Due", align: "left", width: "w-[90px]" },
                    { key: "priority" as const, label: "Priority", align: "left", width: "w-[100px]" },
                  ] as const
                ).map((col) => {
                  const active = col.key && sortField === col.key;
                  return (
                    <th
                      key={col.label}
                      onClick={() => col.key && toggleSort(col.key)}
                      className={`px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap ${col.width} ${col.key ? "cursor-pointer select-none group/sort" : ""}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {active ? (
                          <svg className="w-3 h-3 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            {sortDir === "asc" ? (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            )}
                          </svg>
                        ) : col.key ? (
                          <svg className="w-3 h-3 opacity-0 group-hover/sort:opacity-40 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                          </svg>
                        ) : null}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const assignees = (t.assignees ?? []) as string[];
                return (
                  <tr
                    key={t._id}
                    onClick={() => router.push(`/admin/tickets?ticket=${t._id}`)}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover-tan)] cursor-pointer transition"
                  >
                    <td className="px-2 py-3 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono text-[var(--muted)] shrink-0">
                          {t.ticketNumber ?? "—"}
                        </span>
                        <span className="text-sm text-[var(--foreground)] truncate">
                          {t.title}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <TicketStatusBadge status={t.status} size="xs" />
                    </td>
                    <td className="px-2 py-3">
                      {assignees.length === 0 ? (
                        <span className="text-xs text-[var(--muted)]">—</span>
                      ) : (
                        <div className="flex -space-x-1.5">
                          {assignees.slice(0, 3).map((id) => {
                            const m = memberMap.get(String(id));
                            if (!m) return null;
                            return m.profilePicUrl ? (
                              <img
                                key={String(id)}
                                src={m.profilePicUrl}
                                alt={m.name}
                                title={m.name}
                                className="w-6 h-6 rounded-full border-2 border-white object-cover"
                              />
                            ) : (
                              <div
                                key={String(id)}
                                title={m.name}
                                className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-white text-[10px] font-bold"
                                style={{ backgroundColor: m.color || "#6b7280" }}
                              >
                                {initials(m.name)}
                              </div>
                            );
                          })}
                          {assignees.length > 3 && (
                            <div className="w-6 h-6 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-[10px] font-medium text-[var(--muted)]">
                              +{assignees.length - 3}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-3 text-xs text-[var(--muted)] whitespace-nowrap">
                      {formatDate(t.dueDate)}
                    </td>
                    <td className="px-2 py-3">
                      {t.priority ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--foreground)] whitespace-nowrap">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: PRIORITY_DOTS[t.priority] || "#9ca3af" }}
                          />
                          {PRIORITY_LABELS[t.priority] ?? t.priority}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
