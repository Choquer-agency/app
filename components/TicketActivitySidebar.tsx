"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { TicketActivity, TicketComment } from "@/types";
import { getStatusLabel } from "./TicketStatusBadge";
import { TicketStatus } from "@/types";
import { friendlyDate } from "@/lib/date-format";

const TiptapEditor = dynamic(() => import("./TiptapEditor"), { ssr: false });

function relativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) {
    return `yesterday at ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  if (diffDay < 7) return `${diffDay}d ago`;
  return friendlyDate(isoString);
}

function statusLabel(val: string | null): string {
  if (!val) return "none";
  return getStatusLabel(val as TicketStatus);
}

function formatActivityDescription(entry: TicketActivity): string {
  switch (entry.actionType) {
    case "created":
      return "created this ticket";
    case "status_change":
      return `changed status from ${statusLabel(entry.oldValue)} to ${statusLabel(entry.newValue)}`;
    case "priority_change":
      return `changed priority from ${entry.oldValue || "none"} to ${entry.newValue || "none"}`;
    case "assigned":
      return `assigned ${entry.newValue || "someone"}`;
    case "unassigned":
      return `unassigned ${entry.newValue || entry.oldValue || "someone"}`;
    case "due_date_change":
      return `changed due date${entry.oldValue ? ` from ${entry.oldValue}` : ""}${entry.newValue ? ` to ${entry.newValue}` : ""}`;
    case "start_date_change":
      return `changed start date${entry.oldValue ? ` from ${entry.oldValue}` : ""}${entry.newValue ? ` to ${entry.newValue}` : ""}`;
    case "description_updated":
      return "updated the description";
    case "title_change":
      return "updated the title";
    case "archived":
      return "archived this ticket";
    case "restored":
      return "restored this ticket";
    case "comment_added":
      return "added a comment";
    case "time_logged":
      return "logged time";
    case "attachment_added":
      return "added an attachment";
    default:
      return entry.actionType.replace(/_/g, " ");
  }
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Simple hash to pick a color from the palette
const AVATAR_COLORS = [
  "#B1D0FF", "#A69FFF", "#FFA69E", "#FBBDFF",
  "#BDFFE8", "#ACFF9E", "#FFF09E", "#FFD6A5",
];

function nameColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

type TimelineEntry =
  | { type: "activity"; data: TicketActivity; sortTime: number }
  | { type: "comment"; data: TicketComment; sortTime: number };

interface TicketActivitySidebarProps {
  activity: TicketActivity[];
  loading: boolean;
  comments: TicketComment[];
  commentsLoading: boolean;
  onAddComment: (content: string) => Promise<void>;
  onEditComment: (commentId: number, content: string) => Promise<void>;
  onDeleteComment: (commentId: number) => Promise<void>;
  currentUserId: number | null;
  teamMembers?: { id: number; name: string; profilePicUrl?: string; color?: string }[];
}

export default function TicketActivitySidebar({
  activity,
  loading,
  comments,
  commentsLoading,
  onAddComment,
  onEditComment,
  onDeleteComment,
  currentUserId,
  teamMembers = [],
}: TicketActivitySidebarProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const commentContentRef = useRef("");
  const [sending, setSending] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const editContentRef = useRef("");
  const [editorKey, setEditorKey] = useState(0);

  // Merge activity + comments into a sorted timeline
  const timeline = useMemo(() => {
    const entries: TimelineEntry[] = [];

    for (const a of activity) {
      // Skip "comment_added" activity entries — the comment itself is shown inline
      if (a.actionType === "comment_added") continue;
      entries.push({
        type: "activity",
        data: a,
        sortTime: new Date(a.createdAt).getTime(),
      });
    }

    for (const c of comments) {
      entries.push({
        type: "comment",
        data: c,
        sortTime: new Date(c.createdAt).getTime(),
      });
    }

    entries.sort((a, b) => a.sortTime - b.sortTime);
    return entries;
  }, [activity, comments]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [timeline]);

  async function handleSendComment() {
    const content = commentContentRef.current;
    if (!content || !content.trim()) return;

    setSending(true);
    try {
      await onAddComment(content);
      commentContentRef.current = "";
      setEditorKey((k) => k + 1); // reset editor
    } catch {} finally {
      setSending(false);
    }
  }

  async function handleSaveEdit(commentId: number) {
    const content = editContentRef.current;
    if (!content || !content.trim()) return;

    try {
      await onEditComment(commentId, content);
      setEditingCommentId(null);
    } catch {}
  }

  const isLoading = loading || commentsLoading;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--border)] shrink-0">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">
          Activity
          {timeline.length > 0 && (
            <span className="ml-2 text-xs font-normal text-[var(--muted)]">
              {timeline.length}
            </span>
          )}
        </h3>
      </div>

      {/* Feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-6 h-6 rounded-full bg-gray-200 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-2.5 bg-gray-100 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : timeline.length === 0 ? (
          <p className="text-xs text-[var(--muted)] text-center py-8">
            No activity yet
          </p>
        ) : (
          timeline.map((entry) => {
            if (entry.type === "activity") {
              const a = entry.data;
              return (
                <div key={`a-${a.id}`} className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0 mt-1.5" />
                  <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
                    <p className="text-xs text-[var(--foreground)] leading-relaxed">
                      <span className="font-semibold">{a.actorName}</span>{" "}
                      {formatActivityDescription(a)}
                    </p>
                    <span className="text-[10px] text-[var(--muted)] whitespace-nowrap shrink-0 mt-0.5">
                      {relativeTime(a.createdAt)}
                    </span>
                  </div>
                </div>
              );
            }

            // Comment entry
            const c = entry.data;
            const isOwn = c.authorId === currentUserId;
            const isEditing = editingCommentId === c.id;

            return (
              <div key={`c-${c.id}`} className="group">
                <div className="flex items-start gap-2.5">
                  {/* Avatar */}
                  <div
                    className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold text-gray-700"
                    style={{ backgroundColor: nameColor(c.authorName) }}
                  >
                    {getInitials(c.authorName)}
                  </div>
                  {/* Comment body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-[var(--foreground)]">
                        {c.authorName}
                      </span>
                      <div className="flex items-center gap-1">
                        {isOwn && !isEditing && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                setEditingCommentId(c.id);
                                editContentRef.current = c.content;
                              }}
                              className="p-0.5 rounded hover:bg-gray-100 text-[var(--muted)] hover:text-[var(--foreground)]"
                              title="Edit"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => {
                                if (confirm("Delete this comment?")) {
                                  onDeleteComment(c.id);
                                }
                              }}
                              className="p-0.5 rounded hover:bg-red-50 text-[var(--muted)] hover:text-red-600"
                              title="Delete"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        )}
                        <span className="text-[10px] text-[var(--muted)] whitespace-nowrap">
                          {relativeTime(c.createdAt)}
                        </span>
                      </div>
                    </div>
                    {isEditing ? (
                      <div className="mt-1">
                        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                          <TiptapEditor
                            content={c.content}
                            compact
                            onChange={(json) => { editContentRef.current = json; }}
                            placeholder="Edit comment..."
                          />
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <button
                            onClick={() => handleSaveEdit(c.id)}
                            className="px-2.5 py-1 text-xs font-medium bg-[var(--accent)] text-white rounded-md hover:opacity-90 transition"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingCommentId(null)}
                            className="px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs">
                        <TiptapEditor
                          content={c.content}
                          editable={false}
                          compact
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Comment input */}
      <div className="px-4 py-3 border-t border-[var(--border)] shrink-0">
        <div className="border border-[var(--border)] rounded-lg bg-white">
          <TiptapEditor
            key={editorKey}
            compact
            contentRef={commentContentRef}
            onChange={(json) => { commentContentRef.current = json; }}
            placeholder="Write a comment..."
            onSubmit={handleSendComment}
            mentionItems={teamMembers.map((m) => ({ id: m.id, label: m.name, profilePicUrl: m.profilePicUrl, color: m.color }))}
          />
          <div className="flex items-center justify-end px-3 pb-2">
            <button
              onClick={handleSendComment}
              disabled={sending}
              className={`p-1.5 rounded-md transition ${
                sending
                  ? "text-gray-300 cursor-not-allowed"
                  : "text-[var(--accent)] hover:bg-[var(--accent-light)]"
              }`}
              title="Send (Enter)"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.288Z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
