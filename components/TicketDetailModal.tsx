"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { Ticket, TicketActivity, TicketComment, TeamMember } from "@/types";
import { friendlyDate } from "@/lib/date-format";
import TicketDetailContent from "./TicketDetailContent";
import TicketActivitySidebar from "./TicketActivitySidebar";
import TicketCreateModal from "./TicketCreateModal";
import DateCascadeConfirm from "./DateCascadeConfirm";

interface TicketDetailModalProps {
  ticketId: string;
  teamMembers: TeamMember[];
  onClose: () => void;
  onTicketUpdated: () => void;
}

function formatCreatedDate(isoString: string): string {
  return `Created ${friendlyDate(isoString)}`;
}

export default function TicketDetailModal({
  ticketId,
  teamMembers,
  onClose,
  onTicketUpdated,
}: TicketDetailModalProps) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [activity, setActivity] = useState<TicketActivity[]>([]);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [subTickets, setSubTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentTicketId, setCurrentTicketId] = useState(ticketId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showSubTicketCreate, setShowSubTicketCreate] = useState(false);
  const [cascadeInfo, setCascadeInfo] = useState<{
    field: "startDate" | "dueDate";
    oldDate: string;
    newDate: string;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchTicket = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tickets/${id}`);
      if (res.ok) {
        const data = await res.json();
        try {
          const aRes = await fetch(`/api/admin/tickets/${id}/assignees`);
          if (aRes.ok) data.assignees = await aRes.json();
        } catch {}
        setTicket(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  const fetchActivity = useCallback(async (id: string) => {
    setActivityLoading(true);
    try {
      const res = await fetch(`/api/admin/tickets/${id}/activity`);
      if (res.ok) {
        setActivity(await res.json());
      }
    } catch {} finally {
      setActivityLoading(false);
    }
  }, []);

  const fetchComments = useCallback(async (id: string) => {
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/admin/tickets/${id}/comments`);
      if (res.ok) {
        setComments(await res.json());
      }
    } catch {} finally {
      setCommentsLoading(false);
    }
  }, []);

  const fetchSubTickets = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/tickets?parentTicketId=${id}`);
      if (res.ok) {
        setSubTickets(await res.json());
      }
    } catch {}
  }, []);

  // Fetch current user for comment ownership
  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setCurrentUserId(data.teamMemberId);
          setCurrentUserRole(data.roleLevel ?? null);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchTicket(currentTicketId);
    fetchActivity(currentTicketId);
    fetchComments(currentTicketId);
    fetchSubTickets(currentTicketId);
  }, [currentTicketId, fetchTicket, fetchActivity, fetchComments, fetchSubTickets]);

  // Escape key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (menuOpen) {
          setMenuOpen(false);
        } else {
          onClose();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, menuOpen]);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  async function handleUpdate(fields: Partial<Ticket>) {
    if (!ticket) return;

    // Intercept date changes for project tickets — offer cascade
    if (ticket.projectId && !ticket.isPersonal) {
      const dateField: "startDate" | "dueDate" | null =
        fields.startDate !== undefined && fields.startDate !== ticket.startDate
          ? "startDate"
          : fields.dueDate !== undefined && fields.dueDate !== ticket.dueDate
          ? "dueDate"
          : null;

      if (dateField) {
        const oldDate = ticket[dateField];
        const newDate = fields[dateField] as string | null;
        if (oldDate && newDate) {
          // Save the cascade info for the confirmation dialog
          setCascadeInfo({ field: dateField, oldDate, newDate });
        }
      }
    }

    setTicket((prev) => (prev ? { ...prev, ...fields } : prev));
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (res.ok) {
        fetchActivity(ticket.id);
        onTicketUpdated();
      } else {
        fetchTicket(ticket.id);
      }
    } catch {
      fetchTicket(ticket.id);
    }
  }

  async function handleAssigneeToggle(tId: string, memberId: string, action: "add" | "remove") {
    if (!ticket) return;
    const member = teamMembers.find((m) => m.id === memberId);
    setTicket((prev) => {
      if (!prev) return prev;
      const current = prev.assignees || [];
      if (action === "add" && member) {
        return {
          ...prev,
          assignees: [
            ...current,
            {
              id: String(Date.now()),
              ticketId: tId,
              teamMemberId: memberId,
              assignedAt: new Date().toISOString(),
              memberName: member.name,
              memberEmail: member.email,
              memberColor: member.color,
              memberProfilePicUrl: member.profilePicUrl,
            },
          ],
        };
      }
      return { ...prev, assignees: current.filter((a) => a.teamMemberId !== memberId) };
    });
    try {
      if (action === "add") {
        await fetch(`/api/admin/tickets/${tId}/assignees`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamMemberId: memberId }),
        });
      } else {
        await fetch(`/api/admin/tickets/${tId}/assignees`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamMemberId: memberId }),
        });
      }
      fetchActivity(tId);
      onTicketUpdated();
    } catch {
      fetchTicket(tId);
    }
  }

  async function handleAddComment(content: string) {
    const res = await fetch(`/api/admin/tickets/${currentTicketId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      fetchComments(currentTicketId);
      fetchActivity(currentTicketId);
      onTicketUpdated();
    }
  }

  async function handleEditComment(commentId: string, content: string) {
    const res = await fetch(`/api/admin/tickets/${currentTicketId}/comments/${commentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      fetchComments(currentTicketId);
    }
  }

  async function handleDeleteComment(commentId: string) {
    const res = await fetch(`/api/admin/tickets/${currentTicketId}/comments/${commentId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      fetchComments(currentTicketId);
      fetchActivity(currentTicketId);
    }
  }

  async function handleArchive() {
    if (!ticket) return;
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}`, { method: "DELETE" });
      if (res.ok) {
        onTicketUpdated();
        onClose();
      }
    } catch {}
  }

  function handleSubTicketClick(subId: string) {
    setCurrentTicketId(subId);
    const url = new URL(window.location.href);
    url.searchParams.set("ticket", String(subId));
    window.history.replaceState({}, "", url.toString());
  }

  function handleShare() {
    const url = new URL(window.location.href);
    url.searchParams.set("ticket", String(currentTicketId));
    navigator.clipboard.writeText(url.toString());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal */}
      <div
        className="relative bg-white w-[90%] h-[95%] max-md:w-full max-md:h-full max-md:rounded-none rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar — ClickUp style */}
        {ticket && !loading && (
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-[var(--border)] bg-gray-50/50 shrink-0">
            {/* Left: breadcrumb */}
            <div className="flex items-center gap-1.5 text-xs text-[var(--muted)] min-w-0 overflow-hidden">
              {ticket.clientName && (
                <>
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
                  </svg>
                  <span className="truncate">{ticket.clientName}</span>
                  <span className="text-gray-300">/</span>
                </>
              )}
              <span className="truncate font-medium text-[var(--foreground)]">{ticket.ticketNumber}</span>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Created date */}
              <span className="text-xs text-[var(--muted)] mr-2 hidden sm:block">
                {formatCreatedDate(ticket.createdAt)}
              </span>

              {/* Share */}
              <button
                onClick={handleShare}
                className="p-1.5 rounded-lg hover:bg-gray-200/60 text-[var(--muted)] hover:text-[var(--foreground)] transition relative"
                title="Copy link"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.935-2.186 2.25 2.25 0 0 0-3.935 2.186Z" />
                </svg>
                {copiedLink && (
                  <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] bg-gray-800 text-white px-2 py-0.5 rounded whitespace-nowrap">
                    Copied!
                  </span>
                )}
              </button>

              {/* Three-dot menu */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="p-1.5 rounded-lg hover:bg-gray-200/60 text-[var(--muted)] hover:text-[var(--foreground)] transition"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-[var(--border)] rounded-lg shadow-xl py-1 min-w-[160px] z-50">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(ticket.ticketNumber);
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-[var(--foreground)]"
                    >
                      <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                      </svg>
                      Copy ID
                    </button>
                    <button
                      onClick={() => {
                        handleShare();
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-[var(--foreground)]"
                    >
                      <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                      </svg>
                      Copy link
                    </button>
                    <div className="border-t border-[var(--border)] my-1" />
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        handleArchive();
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 flex items-center gap-2 text-red-600"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                      </svg>
                      Archive
                    </button>
                  </div>
                )}
              </div>

              {/* Close */}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-gray-200/60 text-[var(--muted)] hover:text-[var(--foreground)] transition ml-1"
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-sm text-[var(--muted)]">Loading ticket...</div>
          </div>
        ) : !ticket ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-sm text-[var(--muted)]">Ticket not found</div>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden max-md:flex-col">
            {/* Left: Content */}
            <div className="flex-1 overflow-hidden md:border-r md:border-[var(--border)]">
              <TicketDetailContent
                ticket={ticket}
                teamMembers={teamMembers}
                subTickets={subTickets}
                onUpdate={handleUpdate}
                onAssigneeToggle={handleAssigneeToggle}
                onSubTicketClick={handleSubTicketClick}
                onAddSubTicket={() => setShowSubTicketCreate(true)}
              />
            </div>

            {/* Right: Activity Sidebar */}
            <div className="w-[380px] max-md:w-full max-md:border-t max-md:border-[var(--border)] md:max-w-[380px] shrink-0 overflow-hidden">
              <TicketActivitySidebar
                activity={activity}
                loading={activityLoading}
                comments={comments}
                commentsLoading={commentsLoading}
                onAddComment={handleAddComment}
                onEditComment={handleEditComment}
                onDeleteComment={handleDeleteComment}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                teamMembers={teamMembers}
              />
            </div>
          </div>
        )}
      </div>

      {/* Sub-ticket create modal */}
      {showSubTicketCreate && ticket && (
        <TicketCreateModal
          teamMembers={teamMembers}
          onClose={() => setShowSubTicketCreate(false)}
          parentTicketId={ticket.id}
          parentTicketNumber={ticket.ticketNumber}
          defaultClientId={ticket.clientId}
          defaultClientName={ticket.clientName}
          onCreated={(newTicket) => {
            setShowSubTicketCreate(false);
            fetchSubTickets(currentTicketId);
            fetchActivity(currentTicketId);
            onTicketUpdated();
          }}
        />
      )}

      {/* Date cascade confirmation */}
      {cascadeInfo && ticket && ticket.projectId && (
        <DateCascadeConfirm
          projectId={ticket.projectId}
          ticketId={ticket.id}
          ticketTitle={ticket.title}
          field={cascadeInfo.field}
          oldDate={cascadeInfo.oldDate}
          newDate={cascadeInfo.newDate}
          onClose={() => setCascadeInfo(null)}
          onApplied={() => {
            setCascadeInfo(null);
            onTicketUpdated();
          }}
        />
      )}
    </div>,
    document.body
  );
}
