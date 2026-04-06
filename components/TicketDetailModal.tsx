"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Ticket, TicketActivity, TicketComment, TeamMember } from "@/types";
import { docToTicket, docToAssignee } from "@/lib/ticket-mappers";
import { friendlyDate } from "@/lib/date-format";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import TicketDetailContent from "./TicketDetailContent";
import TicketActivitySidebar from "./TicketActivitySidebar";
import TicketCreateModal from "./TicketCreateModal";
import DateCascadeConfirm from "./DateCascadeConfirm";

interface TicketDetailModalProps {
  ticketId: string;
  teamMembers: TeamMember[];
  onClose: () => void;
  onTicketUpdated?: () => void;
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

  // Real-time queries
  const ticketDoc = useQuery(api.tickets.getById, {
    id: currentTicketId as Id<"tickets">,
  });
  const activityDocs = useQuery(api.ticketActivity.listByTicket, {
    ticketId: currentTicketId as Id<"tickets">,
  });
  const commentDocs = useQuery(api.ticketComments.listByTicket, {
    ticketId: currentTicketId as Id<"tickets">,
  });
  const subTicketDocs = useQuery(api.tickets.list, {
    parentTicketId: currentTicketId as Id<"tickets">,
  });

  const { userId: currentUserId, roleLevel: currentUserRole } = useCurrentUser();

  // Mutations
  const updateTicket = useMutation(api.tickets.update);
  const archiveTicket = useMutation(api.tickets.archive);
  const addAssignee = useMutation(api.tickets.addAssignee);
  const removeAssignee = useMutation(api.tickets.removeAssignee);
  const addComment = useMutation(api.ticketComments.create);
  const editComment = useMutation(api.ticketComments.update);
  const deleteComment = useMutation(api.ticketComments.remove);
  const createActivity = useMutation(api.ticketActivity.create);
  const markReadByTicket = useMutation(api.notifications.markReadByTicket);

  // Map Convex docs to typed objects
  const ticket: Ticket | null = ticketDoc ? docToTicket(ticketDoc) : null;
  const loading = ticketDoc === undefined;
  const activity: TicketActivity[] = activityDocs?.map((d: any) => ({
    id: d._id,
    ticketId: d.ticketId,
    actorId: d.actorId ?? null,
    actorName: d.actorName ?? "",
    actionType: d.actionType ?? "",
    fieldName: d.fieldName ?? null,
    oldValue: d.oldValue ?? null,
    newValue: d.newValue ?? null,
    metadata: d.metadata ?? {},
    createdAt: d._creationTime ? new Date(d._creationTime).toISOString() : new Date().toISOString(),
  })) ?? [];
  const activityLoading = activityDocs === undefined;
  const comments: TicketComment[] = commentDocs?.map((d: any) => ({
    id: d._id,
    ticketId: d.ticketId,
    authorType: d.authorType ?? "team",
    authorId: d.authorId ?? null,
    authorName: d.authorName ?? "",
    authorEmail: d.authorEmail ?? "",
    content: d.content ?? "",
    createdAt: d._creationTime ? new Date(d._creationTime).toISOString() : new Date().toISOString(),
  })) ?? [];
  const commentsLoading = commentDocs === undefined;
  const subTickets: Ticket[] = subTicketDocs?.map(docToTicket) ?? [];

  // Auto-dismiss notifications for this ticket
  useEffect(() => {
    if (currentUserId) {
      markReadByTicket({
        recipientId: currentUserId as Id<"teamMembers">,
        ticketId: currentTicketId as Id<"tickets">,
      }).catch(() => {});
    }
  }, [currentTicketId, currentUserId, markReadByTicket]);

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
          setCascadeInfo({ field: dateField, oldDate, newDate });
        }
      }
    }

    // Build Convex-compatible update args
    const updateArgs: Record<string, unknown> = { id: ticket.id as Id<"tickets"> };
    const allowedFields = [
      "title", "description", "descriptionFormat", "status", "priority",
      "startDate", "dueDate", "dueTime", "ticketGroup", "sortOrder",
      "isPersonal", "isMeeting", "isEmail", "serviceCategory",
    ];
    for (const key of allowedFields) {
      if ((fields as any)[key] !== undefined) {
        updateArgs[key] = (fields as any)[key];
      }
    }
    // Handle ID fields that need casting
    if (fields.clientId !== undefined) updateArgs.clientId = fields.clientId as Id<"clients"> | undefined;
    if (fields.projectId !== undefined) updateArgs.projectId = fields.projectId as Id<"projects"> | undefined;
    if (fields.groupId !== undefined) updateArgs.groupId = fields.groupId as Id<"projectGroups"> | undefined;

    try {
      await updateTicket(updateArgs as any);
      onTicketUpdated?.();
    } catch {
      // useQuery will auto-refresh with server state
    }
  }

  async function handleAssigneeToggle(tId: string, memberId: string, action: "add" | "remove") {
    try {
      if (action === "add") {
        await addAssignee({
          ticketId: tId as Id<"tickets">,
          teamMemberId: memberId as Id<"teamMembers">,
        });
      } else {
        await removeAssignee({
          ticketId: tId as Id<"tickets">,
          teamMemberId: memberId as Id<"teamMembers">,
        });
      }
      onTicketUpdated?.();
    } catch {
      // useQuery will auto-refresh
    }
  }

  async function handleAddComment(content: string) {
    const currentUser = teamMembers.find((m) => m.id === currentUserId);
    await addComment({
      ticketId: currentTicketId as Id<"tickets">,
      authorId: currentUserId as Id<"teamMembers"> | undefined,
      authorName: currentUser?.name ?? "Unknown",
      authorEmail: currentUser?.email,
      content,
    });
    onTicketUpdated?.();
  }

  async function handleEditComment(commentId: string, content: string) {
    await editComment({
      id: commentId as Id<"ticketComments">,
      content,
    });
  }

  async function handleDeleteComment(commentId: string) {
    await deleteComment({
      id: commentId as Id<"ticketComments">,
    });
  }

  async function handleArchive() {
    if (!ticket) return;
    try {
      await archiveTicket({ id: ticket.id as Id<"tickets"> });
      onTicketUpdated?.();
      onClose();
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
          onCreated={() => {
            setShowSubTicketCreate(false);
            onTicketUpdated?.();
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
            onTicketUpdated?.();
          }}
        />
      )}
    </div>,
    document.body
  );
}
