"use client";

import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import dynamic from "next/dynamic";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Ticket, TicketStatus, TicketPriority, TeamMember, ProjectGroup } from "@/types";
import { docToTicket } from "@/lib/ticket-mappers";
import FilterDropdown from "./FilterDropdown";
import StatusDropdown from "./StatusDropdown";
import { PriorityDropdown } from "./TicketPriorityBadge";
import ClientDropdown from "./ClientDropdown";
import DatePicker from "./DatePicker";

const TiptapEditor = dynamic(() => import("./TiptapEditor"), { ssr: false });

interface TicketCreateModalProps {
  teamMembers: TeamMember[];
  onClose: () => void;
  onCreated: (ticket: Ticket) => void;
  defaultStatus?: TicketStatus;
  parentTicketId?: string;
  parentTicketNumber?: string;
  defaultClientId?: string | null;
  defaultClientName?: string;
  defaultProjectId?: string;
  defaultIsPersonal?: boolean;
  defaultIsMeeting?: boolean;
  defaultServiceCategory?: string;
}

export default function TicketCreateModal({
  teamMembers,
  onClose,
  onCreated,
  defaultStatus,
  parentTicketId,
  parentTicketNumber,
  defaultClientId,
  defaultClientName,
  defaultProjectId,
  defaultIsPersonal,
  defaultIsMeeting,
  defaultServiceCategory,
}: TicketCreateModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TicketStatus>(defaultStatus || "needs_attention");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [clientId, setClientId] = useState<string | null>(defaultClientId ?? null);
  const [clientName, setClientName] = useState<string | undefined>(defaultClientName);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<Set<string>>(new Set());
  const [groupId, setGroupId] = useState<string | null>(null);
  const [projectGroups, setProjectGroups] = useState<ProjectGroup[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const createTicket = useMutation(api.tickets.create);

  // Auto-focus title
  useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 50);
  }, []);

  // Fetch project groups if inside a project
  useEffect(() => {
    if (defaultProjectId) {
      fetch(`/api/admin/projects/${defaultProjectId}/groups`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setProjectGroups)
        .catch(() => {});
    }
  }, [defaultProjectId]);

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

  function toggleAssignee(memberId: string) {
    setSelectedAssigneeIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  async function handleCreate() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title is required");
      titleRef.current?.focus();
      return;
    }

    setSaving(true);
    setError("");

    try {
      const args: Record<string, unknown> = {
        title: trimmed,
        status,
        priority,
        assigneeIds: Array.from(selectedAssigneeIds) as Id<"teamMembers">[],
      };
      if (description.trim()) {
        args.description = description.trim();
        args.descriptionFormat = "tiptap";
      }
      if (clientId) args.clientId = clientId as Id<"clients">;
      if (startDate) args.startDate = startDate;
      if (dueDate) args.dueDate = dueDate;
      if (parentTicketId) args.parentTicketId = parentTicketId as Id<"tickets">;
      if (defaultProjectId) args.projectId = defaultProjectId as Id<"projects">;
      if (defaultIsPersonal) args.isPersonal = true;
      if (defaultIsMeeting) args.isMeeting = true;
      if (defaultServiceCategory) args.serviceCategory = defaultServiceCategory;
      if (groupId) args.groupId = groupId;

      const result = await createTicket(args as never);
      onCreated(docToTicket(result));
    } catch {
      setError("Failed to create ticket");
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === "undefined") return null;

  const activeMembers = teamMembers.filter((m) => m.active);

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
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {parentTicketId ? (
              <span>
                New Sub-Ticket
                {parentTicketNumber && (
                  <span className="text-[var(--muted)] font-normal"> of {parentTicketNumber}</span>
                )}
              </span>
            ) : defaultIsMeeting ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                New Meeting
              </span>
            ) : (
              <span>New Task</span>
            )}
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
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleCreate();
              }
            }}
            placeholder="Ticket title"
            className="text-2xl font-bold text-[var(--foreground)] border-none outline-none w-full mb-5 placeholder:text-gray-300 bg-transparent"
          />

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-6 max-md:grid-cols-1">
            {/* Left column */}
            <div className="space-y-3">
              {/* Status */}
              <div className="flex items-center gap-3 min-h-[32px]">
                <div className="flex items-center gap-2 w-[100px] shrink-0">
                  <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <span className="text-sm text-[var(--muted)]">Status</span>
                </div>
                <StatusDropdown status={status} onChange={setStatus} />
              </div>

              {/* Stage — only when inside a project with groups */}
              {projectGroups.length > 0 && (
              <div className="flex items-center gap-3 min-h-[32px]">
                <div className="flex items-center gap-2 w-[100px] shrink-0">
                  <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
                  </svg>
                  <span className="text-sm text-[var(--muted)]">Stage</span>
                </div>
                <FilterDropdown
                  label=""
                  value={groupId ?? ""}
                  onChange={(v) => setGroupId(v || null)}
                  options={[
                    { value: "", label: "No stage" },
                    ...projectGroups.map((g) => ({ value: g.id, label: g.name })),
                  ]}
                />
              </div>
              )}

              {/* Dates */}
              <div className="flex items-center gap-3 min-h-[32px]">
                <div className="flex items-center gap-2 w-[100px] shrink-0">
                  <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                  </svg>
                  <span className="text-sm text-[var(--muted)]">Dates</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <DatePicker
                    value={startDate}
                    onChange={setStartDate}
                    placeholder="Start"
                    displayFormat="short"
                  />
                  <span className="text-[var(--muted)]">&rarr;</span>
                  <DatePicker
                    value={dueDate}
                    onChange={setDueDate}
                    placeholder="Due"
                    displayFormat="short"
                  />
                </div>
              </div>

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
            </div>

            {/* Right column */}
            <div className="space-y-3">
              {/* Assignees */}
              <div className="flex items-center gap-3 min-h-[32px]">
                <div className="flex items-center gap-2 w-[100px] shrink-0">
                  <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                  <span className="text-sm text-[var(--muted)]">Assignees</span>
                </div>
                <CreateAssigneePicker
                  teamMembers={activeMembers}
                  selectedIds={selectedAssigneeIds}
                  onToggle={toggleAssignee}
                />
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
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[var(--border)] my-2" />

          {/* Description — Tiptap rich text editor */}
          <div className="mt-4">
            <TiptapEditor
              onChange={setDescription}
              placeholder="Add a description..."
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
              onClick={handleCreate}
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-[var(--accent)] hover:opacity-90 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Creating..." : "Create Ticket"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Assignee picker for create mode (no ticketId yet)
function CreateAssigneePicker({
  teamMembers,
  selectedIds,
  onToggle,
}: {
  teamMembers: TeamMember[];
  selectedIds: Set<string>;
  onToggle: (memberId: string) => void;
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
                    <svg className="w-4 h-4 text-[var(--accent)]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
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
