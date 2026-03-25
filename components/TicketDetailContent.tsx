"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Ticket, TicketStatus, TicketPriority, TicketAssignee, TeamMember, TicketAttachment, TicketCommitment } from "@/types";
import StatusDropdown from "./StatusDropdown";
import { PriorityDropdown } from "./TicketPriorityBadge";
import AssigneeDropdown from "./AssigneeDropdown";
import TicketAssigneeAvatars from "./TicketAssigneeAvatars";
import DatePicker from "./DatePicker";
import { friendlyDate } from "@/lib/date-format";
import ClientDropdown from "./ClientDropdown";
import { StatusDot } from "./TicketStatusBadge";
import TimeTracker from "./TimeTracker";
import TimeEntryList from "./TimeEntryList";
import AttachmentList from "./AttachmentList";
import FileUpload from "./FileUpload";

const TiptapEditor = dynamic(() => import("./TiptapEditor"), { ssr: false });

async function copyEmailToClipboard(descJson: string): Promise<boolean> {
  try {
    // Dynamically import tiptap utilities to generate HTML from JSON
    const { generateHTML } = await import("@tiptap/core");
    const { default: StarterKit } = await import("@tiptap/starter-kit");
    const { default: Underline } = await import("@tiptap/extension-underline");
    const { default: Link } = await import("@tiptap/extension-link");

    const json = JSON.parse(descJson);
    const html = generateHTML(json, [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link,
    ]);

    // Copy as rich text (HTML) so it pastes with formatting into Gmail/Outlook
    const blob = new Blob([html], { type: "text/html" });
    const textBlob = new Blob([html.replace(/<[^>]+>/g, "")], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": blob,
        "text/plain": textBlob,
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

interface TicketDetailContentProps {
  ticket: Ticket;
  teamMembers: TeamMember[];
  subTickets: Ticket[];
  onUpdate: (fields: Partial<Ticket>) => void;
  onAssigneeToggle: (ticketId: string, memberId: string, action: "add" | "remove") => void;
  onSubTicketClick: (ticketId: string) => void;
  onAddSubTicket: () => void;
}

export default function TicketDetailContent({
  ticket,
  teamMembers,
  subTickets,
  onUpdate,
  onAssigneeToggle,
  onSubTicketClick,
  onAddSubTicket,
}: TicketDetailContentProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(ticket.title);
  const [descValue, setDescValue] = useState(ticket.description || "");
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [parentTicket, setParentTicket] = useState<{ id: string; ticketNumber: string; title: string } | null>(null);
  const [commitments, setCommitments] = useState<TicketCommitment[]>([]);
  const [showCommitForm, setShowCommitForm] = useState(false);
  const [commitDate, setCommitDate] = useState<string | null>(null);
  const [commitNote, setCommitNote] = useState("");
  const [commitSaving, setCommitSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const descDirty = useRef(false);

  // Sync when ticket changes (e.g. navigating between sub-tickets)
  useEffect(() => {
    setTitleValue(ticket.title);
    setDescValue(ticket.description || "");
    setEditingTitle(false);
    descDirty.current = false;
  }, [ticket.id, ticket.title, ticket.description]);

  // Fetch parent ticket info for breadcrumb
  useEffect(() => {
    if (ticket.parentTicketId) {
      fetch(`/api/admin/tickets/${ticket.parentTicketId}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data) setParentTicket({ id: data.id, ticketNumber: data.ticketNumber, title: data.title });
          else setParentTicket(null);
        })
        .catch(() => setParentTicket(null));
    } else {
      setParentTicket(null);
    }
  }, [ticket.parentTicketId]);

  // Fetch commitments
  const fetchCommitments = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}/commitments`);
      if (res.ok) setCommitments(await res.json());
    } catch {}
  }, [ticket.id]);

  useEffect(() => { fetchCommitments(); }, [fetchCommitments]);

  async function handleAddCommitment() {
    if (!commitDate || !ticket.assignees?.length) return;
    setCommitSaving(true);
    try {
      // Set commitment for the first assignee (or all assignees)
      for (const a of ticket.assignees) {
        await fetch(`/api/admin/tickets/${ticket.id}/commitments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamMemberId: a.teamMemberId, committedDate: commitDate, notes: commitNote }),
        });
      }
      setShowCommitForm(false);
      setCommitDate(null);
      setCommitNote("");
      fetchCommitments();
    } catch {} finally {
      setCommitSaving(false);
    }
  }

  useEffect(() => {
    if (editingTitle && titleRef.current) {
      titleRef.current.focus();
      titleRef.current.select();
    }
  }, [editingTitle]);

  // Fetch attachments
  const fetchAttachments = useCallback(async () => {
    setAttachmentsLoading(true);
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}/attachments`);
      if (res.ok) setAttachments(await res.json());
    } catch {} finally {
      setAttachmentsLoading(false);
    }
  }, [ticket.id]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const saveTitle = useCallback(() => {
    setEditingTitle(false);
    const trimmed = titleValue.trim();
    if (trimmed && trimmed !== ticket.title) {
      onUpdate({ title: trimmed });
    } else {
      setTitleValue(ticket.title);
    }
  }, [titleValue, ticket.title, onUpdate]);

  function saveDescription() {
    if (descDirty.current && descValue !== ticket.description) {
      onUpdate({ description: descValue, descriptionFormat: "tiptap" } as Partial<Ticket>);
      descDirty.current = false;
    }
  }

  async function handleAttachmentUpload(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/admin/tickets/${ticket.id}/attachments`, {
      method: "POST",
      body: formData,
    });
    if (res.ok) fetchAttachments();
  }

  async function handleAttachmentDelete(attachmentId: string) {
    const res = await fetch(`/api/admin/tickets/${ticket.id}/attachments/${attachmentId}`, {
      method: "DELETE",
    });
    if (res.ok) fetchAttachments();
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto px-8 py-6">
      {/* Parent breadcrumb (for subtasks) */}
      {parentTicket && (
        <div className="flex items-center gap-1.5 text-xs text-[var(--muted)] mb-2">
          <button
            onClick={() => onSubTicketClick(parentTicket.id)}
            className="hover:text-[var(--foreground)] transition truncate max-w-[300px]"
          >
            {parentTicket.title}
          </button>
          <span className="text-gray-300">/</span>
          <span className="text-[var(--foreground)] font-medium truncate max-w-[300px]">{ticket.title}</span>
        </div>
      )}

      {/* Ticket ID icon — small, like ClickUp's {ID} button (hidden when subtask breadcrumb is shown) */}
      {!parentTicket && (
        <div className="flex items-center gap-2 mb-4">
          <button
            className="inline-flex items-center gap-1 text-[var(--muted)] hover:text-[var(--foreground)] transition text-xs"
            title={ticket.ticketNumber}
            onClick={() => {
              navigator.clipboard.writeText(ticket.ticketNumber);
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h6m-6 0 3-3m-3 3 3 3" />
            </svg>
            <span className="font-mono">{ticket.ticketNumber}</span>
          </button>
        </div>
      )}

      {/* Title — large, inline editable */}
      {editingTitle ? (
        <input
          ref={titleRef}
          value={titleValue}
          onChange={(e) => setTitleValue(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveTitle();
            if (e.key === "Escape") {
              setTitleValue(ticket.title);
              setEditingTitle(false);
            }
          }}
          className="text-2xl font-bold text-[var(--foreground)] border-b-2 border-[var(--accent)] outline-none pb-1 mb-5 bg-transparent w-full"
        />
      ) : (
        <h2
          onClick={() => setEditingTitle(true)}
          className="text-2xl font-bold text-[var(--foreground)] mb-5 cursor-text hover:bg-gray-50 rounded px-1 -mx-1 py-0.5 transition"
        >
          {ticket.title}
        </h2>
      )}

      {/* Two-column metadata grid — ClickUp style */}
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
            <StatusDropdown
              status={ticket.status}
              onChange={(s) => onUpdate({ status: s })}
              size="sm"
            />
          </div>

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
                value={ticket.startDate}
                onChange={(d) => onUpdate({ startDate: d } as Partial<Ticket>)}
                placeholder="Start"
                displayFormat="short"
              />
              <span className="text-[var(--muted)]">&rarr;</span>
              <DatePicker
                value={ticket.dueDate}
                onChange={(d) => onUpdate({ dueDate: d } as Partial<Ticket>)}
                placeholder="Due"
                displayFormat="short"
              />
            </div>
          </div>

          {/* Time tracked */}
          <div className="flex items-center gap-3 min-h-[32px]">
            <div className="flex items-center gap-2 w-[100px] shrink-0">
              <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <span className="text-sm text-[var(--muted)]">Track time</span>
            </div>
            <TimeTracker
              ticketId={ticket.id}
              onTimerChange={() => {
                window.dispatchEvent(new CustomEvent("timerChange"));
              }}
            />
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
              clientId={ticket.clientId}
              clientName={ticket.clientName}
              onChange={(id, name) => onUpdate({ clientId: id, clientName: name ?? undefined } as Partial<Ticket>)}
            />
          </div>

          {/* Commitment */}
          <div className="flex items-start gap-3 min-h-[32px]">
            <div className="flex items-center gap-2 w-[100px] shrink-0 mt-1">
              <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.745 3.745 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
              </svg>
              <span className="text-sm text-[var(--muted)]">Commit</span>
            </div>
            <div className="flex-1">
              {commitments.filter((c) => c.status === "active").length > 0 ? (
                <div className="space-y-1">
                  {commitments.filter((c) => c.status === "active").map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <span className="text-blue-600 font-medium">
                        {friendlyDate(c.committedDate)}
                      </span>
                      {c.notes && <span className="text-xs text-[var(--muted)]">— {c.notes}</span>}
                    </div>
                  ))}
                  <button onClick={() => setShowCommitForm(true)} className="text-xs text-[var(--accent)] hover:underline">
                    Update commitment
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowCommitForm(true)}
                  className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition"
                >
                  Set commitment...
                </button>
              )}
              {showCommitForm && (
                <div className="flex items-center gap-2 mt-2">
                  <DatePicker value={commitDate} onChange={setCommitDate} placeholder="Date" displayFormat="short" />
                  <input
                    type="text"
                    value={commitNote}
                    onChange={(e) => setCommitNote(e.target.value)}
                    placeholder="Note..."
                    className="flex-1 text-xs border border-[var(--border)] rounded-lg px-2 py-1.5 outline-none focus:border-[var(--accent)]"
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddCommitment(); }}
                  />
                  <button onClick={handleAddCommitment} disabled={!commitDate || commitSaving} className="text-xs font-medium text-white bg-[var(--accent)] rounded-lg px-2.5 py-1.5 hover:opacity-90 disabled:opacity-40">
                    {commitSaving ? "..." : "Save"}
                  </button>
                  <button onClick={() => setShowCommitForm(false)} className="text-xs text-[var(--muted)]">Cancel</button>
                </div>
              )}
              {/* Past commitments */}
              {commitments.filter((c) => c.status !== "active").length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {commitments.filter((c) => c.status !== "active").slice(0, 3).map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs text-[var(--muted)]">
                      <span className={c.status === "met" ? "text-green-600" : "text-red-500"}>
                        {c.status === "met" ? "Met" : "Missed"}
                      </span>
                      <span>{friendlyDate(c.committedDate)}</span>
                      {c.notes && <span>— {c.notes}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
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
            <div className="flex items-center gap-2">
              {ticket.assignees && ticket.assignees.length > 0 ? (
                <AssigneeDropdown
                  ticketId={ticket.id}
                  assignees={ticket.assignees}
                  teamMembers={teamMembers}
                  onToggle={onAssigneeToggle}
                />
              ) : (
                <AssigneeDropdown
                  ticketId={ticket.id}
                  assignees={[]}
                  teamMembers={teamMembers}
                  onToggle={onAssigneeToggle}
                />
              )}
            </div>
          </div>

          {/* Priority */}
          <div className="flex items-center gap-3 min-h-[32px]">
            <div className="flex items-center gap-2 w-[100px] shrink-0">
              <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
              </svg>
              <span className="text-sm text-[var(--muted)]">Priority</span>
            </div>
            <PriorityDropdown
              priority={ticket.priority}
              onChange={(p) => onUpdate({ priority: p })}
              size="sm"
            />
          </div>

          {/* Created By */}
          <div className="flex items-center gap-3 min-h-[32px]">
            <div className="flex items-center gap-2 w-[100px] shrink-0">
              <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              <span className="text-sm text-[var(--muted)]">Created by</span>
            </div>
            <span className="text-sm text-[var(--foreground)]">
              {ticket.createdByName || <span className="text-[var(--muted)]">Unknown</span>}
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-[var(--border)] my-2" />

      {/* Description — Tiptap rich text editor */}
      <div className="mt-4 mb-6">
        {ticket.isEmail && descValue && (
          <CopyEmailButton descJson={descValue} />
        )}
        <div onBlur={saveDescription}>
          <TiptapEditor
            content={descValue}
            onChange={(json) => {
              setDescValue(json);
              descDirty.current = true;
            }}
            placeholder="Add a description..."
            mentionItems={teamMembers.map((m) => ({ id: m.id, label: m.name, profilePicUrl: m.profilePicUrl, color: m.color }))}
          />
        </div>
      </div>

      {/* Attachments */}
      <div className="mb-6">
        {!attachmentsLoading && attachments.length > 0 && (
          <div className="mb-3">
            <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
              Attachments
            </h4>
            <AttachmentList
              attachments={attachments}
              onDelete={handleAttachmentDelete}
            />
          </div>
        )}
        <FileUpload onUpload={handleAttachmentUpload} />
      </div>

      {/* Sub-tickets */}
      {subTickets.length > 0 ? (
        <div className="mb-4">
          <div className="border-t border-[var(--border)] pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">
                Sub-tickets
                <span className="ml-1.5 text-xs font-normal text-[var(--muted)]">
                  {subTickets.length}
                </span>
              </h3>
              <button
                onClick={onAddSubTicket}
                className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add
              </button>
            </div>
            <div className="border border-[var(--border)] rounded-lg overflow-hidden">
              {subTickets.map((sub, i) => (
                <button
                  key={sub.id}
                  onClick={() => onSubTicketClick(sub.id)}
                  className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 text-sm hover:bg-gray-50 transition ${
                    i > 0 ? "border-t border-[var(--border)]" : ""
                  }`}
                >
                  <StatusDot status={sub.status} size={8} />
                  <span className="text-[var(--muted)] text-xs font-mono shrink-0">
                    {sub.ticketNumber}
                  </span>
                  <span className="text-[var(--foreground)] truncate flex-1">
                    {sub.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <button
            onClick={onAddSubTicket}
            className="flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition py-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add sub-ticket
          </button>
        </div>
      )}

      {/* Time entries */}
      <TimeEntryList ticketId={ticket.id} />
    </div>
  );
}

function CopyEmailButton({ descJson }: { descJson: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyEmailToClipboard(descJson);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Keyboard shortcut: Cmd+Shift+C
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "c") {
        e.preventDefault();
        handleCopy();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  });

  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <div className="flex items-center gap-1.5 px-2 py-1 bg-violet-50 border border-violet-200 rounded-lg">
        <svg className="w-3.5 h-3.5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
        </svg>
        <span className="text-[10px] font-medium text-violet-600">Email Template</span>
      </div>
      <button
        onClick={handleCopy}
        className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-lg transition ${
          copied
            ? "bg-green-50 text-green-600 border border-green-200"
            : "bg-white text-[var(--foreground)] border border-[var(--border)] hover:bg-gray-50"
        }`}
      >
        {copied ? (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Copied!
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
            </svg>
            Copy Email
            <span className="text-[9px] text-[var(--muted)] ml-1">⌘⇧C</span>
          </>
        )}
      </button>
    </div>
  );
}
