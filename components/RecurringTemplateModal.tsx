"use client";

import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import dynamic from "next/dynamic";
import {
  RecurringTicketTemplate,
  RecurrenceRule,
  TicketPriority,
  TeamMember,
} from "@/types";
import { PriorityDropdown } from "./TicketPriorityBadge";
import ClientDropdown from "./ClientDropdown";
import DatePicker from "./DatePicker";
import FilterDropdown from "./FilterDropdown";

const TiptapEditor = dynamic(() => import("./TiptapEditor"), { ssr: false });

interface RecurringTemplateModalProps {
  teamMembers: TeamMember[];
  template?: RecurringTicketTemplate;
  defaultClientId?: number;
  defaultClientName?: string;
  onClose: () => void;
  onSaved: (template: RecurringTicketTemplate) => void;
}

const RECURRENCE_LABELS: Record<RecurrenceRule, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface ProjectOption {
  id: number;
  name: string;
}

export default function RecurringTemplateModal({
  teamMembers,
  template,
  defaultClientId,
  defaultClientName,
  onClose,
  onSaved,
}: RecurringTemplateModalProps) {
  const isEdit = !!template;

  const [title, setTitle] = useState(template?.title || "");
  const [description, setDescription] = useState(template?.description || "");
  const [descriptionFormat, setDescriptionFormat] = useState<"plain" | "tiptap">(
    template?.descriptionFormat || "plain"
  );
  const [clientId, setClientId] = useState<number | null>(
    template?.clientId ?? defaultClientId ?? null
  );
  const [clientName, setClientName] = useState<string | undefined>(
    template?.clientName ?? defaultClientName
  );
  const [projectId, setProjectId] = useState<number | null>(template?.projectId ?? null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [priority, setPriority] = useState<TicketPriority>(template?.priority || "normal");
  const [ticketGroup, setTicketGroup] = useState(template?.ticketGroup || "");
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule>(
    template?.recurrenceRule || "monthly"
  );
  const [recurrenceDay, setRecurrenceDay] = useState<number>(template?.recurrenceDay ?? 1);
  const [nextCreateAt, setNextCreateAt] = useState<string | null>(template?.nextCreateAt || null);
  const [active, setActive] = useState(template?.active ?? true);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<Set<number>>(
    new Set(template?.assignees?.map((a) => a.teamMemberId) || [])
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  // Auto-focus title
  useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 50);
  }, []);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Fetch projects for selected client
  useEffect(() => {
    if (!clientId) {
      setProjects([]);
      setProjectId(null);
      return;
    }
    fetch(`/api/admin/projects?clientId=${clientId}`)
      .then((r) => r.json())
      .then((data) => {
        const opts = (data as { id: number; name: string }[]).map((p) => ({
          id: p.id,
          name: p.name,
        }));
        setProjects(opts);
        // Clear projectId if it doesn't belong to this client
        if (projectId && !opts.some((p) => p.id === projectId)) {
          setProjectId(null);
        }
      })
      .catch(() => setProjects([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // When recurrence rule changes, reset day to sensible default
  useEffect(() => {
    if (recurrenceRule === "weekly" || recurrenceRule === "biweekly") {
      // If current day is > 6 (monthly/quarterly value), reset to Monday
      if (recurrenceDay > 6) setRecurrenceDay(1);
    } else {
      // If current day is < 1 or > 28, reset to 1
      if (recurrenceDay < 1 || recurrenceDay > 28) setRecurrenceDay(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurrenceRule]);

  function toggleAssignee(memberId: number) {
    setSelectedAssigneeIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title is required");
      titleRef.current?.focus();
      return;
    }
    if (!clientId) {
      setError("Client is required");
      return;
    }
    if (!nextCreateAt) {
      setError("Next create date is required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const body: Record<string, unknown> = {
        title: trimmed,
        clientId,
        projectId: projectId || null,
        priority,
        ticketGroup,
        recurrenceRule,
        recurrenceDay,
        nextCreateAt,
        assigneeIds: Array.from(selectedAssigneeIds),
      };

      if (description.trim()) {
        body.description = description.trim();
        body.descriptionFormat = "tiptap";
      } else {
        body.description = "";
        body.descriptionFormat = "plain";
      }

      if (isEdit) {
        body.active = active;
      }

      const url = isEdit
        ? `/api/admin/recurring/${template.id}`
        : "/api/admin/recurring";

      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const saved = await res.json();
        onSaved(saved);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to save template");
      }
    } catch {
      setError("Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === "undefined") return null;

  const activeMembers = teamMembers.filter((m) => m.active);
  const isWeekly = recurrenceRule === "weekly" || recurrenceRule === "biweekly";

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal */}
      <div
        className="relative bg-white w-[90%] max-w-[720px] max-h-[95%] max-md:w-full max-md:h-full max-md:max-h-full max-md:rounded-none rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
            <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
            </svg>
            <span>{isEdit ? "Edit Recurring Template" : "New Recurring Template"}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-200/60 text-[var(--muted)] hover:text-[var(--foreground)] transition"
          >
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {/* Title */}
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError("");
            }}
            placeholder="Template title (e.g. Monthly SEO Report)"
            className="text-2xl font-bold text-[var(--foreground)] border-none outline-none w-full mb-5 placeholder:text-gray-300 bg-transparent"
          />

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-6 max-md:grid-cols-1">
            {/* Left column */}
            <div className="space-y-3">
              {/* Client */}
              <div className="flex items-center gap-3 min-h-[32px]">
                <div className="flex items-center gap-2 w-[100px] shrink-0">
                  <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
                  </svg>
                  <span className="text-sm text-[var(--muted)]">Client</span>
                </div>
                <ClientDropdown
                  clientId={clientId}
                  clientName={clientName}
                  onChange={(id, name) => {
                    setClientId(id);
                    setClientName(name ?? undefined);
                  }}
                />
              </div>

              {/* Project */}
              <div className="flex items-center gap-3 min-h-[32px]">
                <div className="flex items-center gap-2 w-[100px] shrink-0">
                  <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                  </svg>
                  <span className="text-sm text-[var(--muted)]">Project</span>
                </div>
                {clientId ? (
                  <FilterDropdown
                    label=""
                    value={projectId != null ? String(projectId) : ""}
                    onChange={(v) => setProjectId(v ? Number(v) : null)}
                    options={[
                      { value: "", label: "No project" },
                      ...projects.map((p) => ({ value: String(p.id), label: p.name })),
                    ]}
                  />
                ) : (
                  <span className="text-sm text-gray-300">Select client first</span>
                )}
              </div>

              {/* Priority */}
              <div className="flex items-center gap-3 min-h-[32px]">
                <div className="flex items-center gap-2 w-[100px] shrink-0">
                  <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
                  </svg>
                  <span className="text-sm text-[var(--muted)]">Priority</span>
                </div>
                <PriorityDropdown priority={priority} onChange={setPriority} />
              </div>

              {/* Ticket Group */}
              <div className="flex items-center gap-3 min-h-[32px]">
                <div className="flex items-center gap-2 w-[100px] shrink-0">
                  <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
                  </svg>
                  <span className="text-sm text-[var(--muted)]">Group</span>
                </div>
                <input
                  value={ticketGroup}
                  onChange={(e) => setTicketGroup(e.target.value)}
                  placeholder="Optional group name"
                  className="text-sm border border-[var(--border)] rounded-lg px-2.5 py-1.5 bg-white text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--accent)] w-full max-w-[200px]"
                />
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-3">
              {/* Recurrence Rule */}
              <div className="flex items-center gap-3 min-h-[32px]">
                <div className="flex items-center gap-2 w-[100px] shrink-0">
                  <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
                  </svg>
                  <span className="text-sm text-[var(--muted)]">Repeat</span>
                </div>
                <FilterDropdown
                  label=""
                  value={recurrenceRule}
                  onChange={(v) => setRecurrenceRule(v as RecurrenceRule)}
                  options={(Object.keys(RECURRENCE_LABELS) as RecurrenceRule[]).map((rule) => ({
                    value: String(rule),
                    label: RECURRENCE_LABELS[rule],
                  }))}
                />
              </div>

              {/* Recurrence Day */}
              <div className="flex items-center gap-3 min-h-[32px]">
                <div className="flex items-center gap-2 w-[100px] shrink-0">
                  <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                  </svg>
                  <span className="text-sm text-[var(--muted)]">On day</span>
                </div>
                {isWeekly ? (
                  <FilterDropdown
                    label=""
                    value={String(recurrenceDay)}
                    onChange={(v) => setRecurrenceDay(Number(v))}
                    options={DAY_NAMES.map((name, i) => ({ value: String(i), label: name }))}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={28}
                      value={recurrenceDay}
                      onChange={(e) => {
                        const v = Math.max(1, Math.min(28, Number(e.target.value) || 1));
                        setRecurrenceDay(v);
                      }}
                      className="text-sm border border-[var(--border)] rounded-lg px-2.5 py-1.5 bg-white text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--accent)] w-[70px]"
                    />
                    <span className="text-xs text-[var(--muted)]">of the month</span>
                  </div>
                )}
              </div>

              {/* Next Create Date */}
              <div className="flex items-center gap-3 min-h-[32px]">
                <div className="flex items-center gap-2 w-[100px] shrink-0">
                  <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <span className="text-sm text-[var(--muted)]">Next run</span>
                </div>
                <DatePicker
                  value={nextCreateAt}
                  onChange={setNextCreateAt}
                  placeholder="Select date"
                  displayFormat="short"
                />
              </div>

              {/* Assignees */}
              <div className="flex items-center gap-3 min-h-[32px]">
                <div className="flex items-center gap-2 w-[100px] shrink-0">
                  <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                  <span className="text-sm text-[var(--muted)]">Assignees</span>
                </div>
                <AssigneePicker
                  teamMembers={activeMembers}
                  selectedIds={selectedAssigneeIds}
                  onToggle={toggleAssignee}
                />
              </div>

              {/* Active toggle (edit mode only) */}
              {isEdit && (
                <div className="flex items-center gap-3 min-h-[32px]">
                  <div className="flex items-center gap-2 w-[100px] shrink-0">
                    <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9" />
                    </svg>
                    <span className="text-sm text-[var(--muted)]">Active</span>
                  </div>
                  <button
                    onClick={() => setActive(!active)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      active ? "bg-[var(--accent)]" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        active ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[var(--border)] my-2" />

          {/* Description — Tiptap rich text editor */}
          <div className="mt-4">
            <TiptapEditor
              content={isEdit && descriptionFormat === "tiptap" ? description : undefined}
              onChange={setDescription}
              placeholder="Add a description for created tickets..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-[var(--border)] bg-gray-50/50 shrink-0">
          <div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition rounded-lg hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-[var(--accent)] hover:opacity-90 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Template"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Assignee picker (same pattern as TicketCreateModal)
function AssigneePicker({
  teamMembers,
  selectedIds,
  onToggle,
}: {
  teamMembers: TeamMember[];
  selectedIds: Set<number>;
  onToggle: (memberId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleScroll() { setOpen(false); }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("scroll", handleScroll, true);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  function toggleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      setPos({ top: rect.bottom / zoom + 4, left: rect.left / zoom });
    }
    setOpen(!open);
  }

  const selected = teamMembers.filter((m) => selectedIds.has(m.id));

  return (
    <>
      <div
        ref={buttonRef}
        onClick={toggleOpen}
        className="cursor-pointer focus:outline-none"
      >
        {selected.length > 0 ? (
          <div className="flex items-center -space-x-1.5">
            {selected.slice(0, 3).map((m) => (
              <div
                key={m.id}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 overflow-hidden border-2 border-white"
                style={{
                  backgroundColor: m.color || "#e5e7eb",
                  color: m.color ? "#fff" : "#6b7280",
                }}
                title={m.name}
              >
                {m.profilePicUrl ? (
                  <img src={m.profilePicUrl} alt={m.name} className="w-full h-full object-cover" />
                ) : (
                  m.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
                )}
              </div>
            ))}
            {selected.length > 3 && (
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600 border-2 border-white">
                +{selected.length - 3}
              </div>
            )}
            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 border-2 border-white hover:bg-gray-200 transition">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition">
            <svg className="w-5 h-5 rounded-full bg-gray-100 p-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add
          </span>
        )}
      </div>
      {open &&
        typeof document !== "undefined" &&
        ReactDOM.createPortal(
          <div
            ref={menuRef}
            className="bg-white border border-[var(--border)] rounded-lg shadow-xl py-0 overflow-hidden min-w-[220px]"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              zIndex: 9999,
            }}
          >
            {teamMembers.map((m) => {
              const isSelected = selectedIds.has(m.id);
              return (
                <button
                  key={m.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(m.id);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--accent-light)] transition flex items-center gap-2.5 ${
                    isSelected ? "bg-[var(--accent-light)]" : ""
                  }`}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 overflow-hidden"
                    style={{
                      backgroundColor: m.color || "#e5e7eb",
                      color: m.color ? "#fff" : "#6b7280",
                    }}
                  >
                    {m.profilePicUrl ? (
                      <img src={m.profilePicUrl} alt={m.name} className="w-full h-full object-cover" />
                    ) : (
                      m.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
                    )}
                  </div>
                  <span className="flex-1">{m.name}</span>
                  {isSelected && (
                    <svg className="w-4 h-4 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
