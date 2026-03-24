"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const TiptapEditor = dynamic(() => import("@/components/TiptapEditor"), { ssr: false });

interface TicketDetail {
  id: number;
  ticketNumber: string;
  title: string;
  description: string;
  descriptionFormat: "plain" | "tiptap";
  status: string;
  priority: string;
  dueDate: string | null;
  createdAt: string;
  assignees: Array<{
    memberName?: string;
    memberColor?: string;
    memberProfilePicUrl?: string;
  }>;
  comments: Array<{
    id: number;
    authorType: "team" | "client";
    authorName: string;
    content: string;
    createdAt: string;
  }>;
  attachments: Array<{
    id: number;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    fileType: string;
  }>;
}

const STATUS_LABELS: Record<string, string> = {
  needs_attention: "Needs Attention",
  stuck: "Stuck",
  in_progress: "In Progress",
  qa_ready: "QA Ready",
  client_review: "Client Review",
  approved_go_live: "Approved / Go Live",
  closed: "Closed",
};

const STATUS_COLORS: Record<string, string> = {
  needs_attention: "bg-orange-100 text-orange-700",
  stuck: "bg-red-100 text-red-700",
  in_progress: "bg-blue-100 text-blue-700",
  qa_ready: "bg-purple-100 text-purple-700",
  client_review: "bg-yellow-100 text-yellow-700",
  approved_go_live: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-500",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

interface ClientTicketDetailProps {
  slug: string;
  ticketId: number;
}

export default function ClientTicketDetail({ slug, ticketId }: ClientTicketDetailProps) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentName, setCommentName] = useState("");
  const [commentEmail, setCommentEmail] = useState("");
  const [commentContent, setCommentContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState("");

  useEffect(() => {
    fetch(`/api/clients/${slug}/tickets/${ticketId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setTicket)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug, ticketId]);

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentName.trim() || !commentContent.trim()) return;
    setSubmitting(true);
    setCommentError("");

    try {
      const res = await fetch(`/api/clients/${slug}/tickets/${ticketId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorName: commentName.trim(),
          authorEmail: commentEmail.trim(),
          content: commentContent.trim(),
        }),
      });

      if (res.ok) {
        const newComment = await res.json();
        setTicket((prev) =>
          prev ? { ...prev, comments: [...prev.comments, newComment] } : prev
        );
        setCommentContent("");
      } else {
        const err = await res.json();
        setCommentError(err.error || "Failed to add comment");
      }
    } catch {
      setCommentError("Failed to add comment");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#FF9500]" />
      </div>
    );
  }

  if (!ticket) {
    return <div className="text-center py-12 text-sm text-[#6b7280]">Ticket not found</div>;
  }

  const canComment = ticket.status === "client_review";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${STATUS_COLORS[ticket.status] || "bg-gray-100 text-gray-500"}`}>
            {STATUS_LABELS[ticket.status] || ticket.status}
          </span>
          <span className="text-xs font-mono text-[#9ca3af]">{ticket.ticketNumber}</span>
          {ticket.dueDate && (
            <span className={`text-xs ${
              ticket.dueDate < new Date().toISOString().slice(0, 10)
                ? "text-red-600 font-semibold"
                : "text-[#9ca3af]"
            }`}>
              Due {ticket.dueDate}
            </span>
          )}
        </div>
        <h2 className="text-lg font-bold text-[#1A1A1A]">{ticket.title}</h2>
        {ticket.assignees.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-xs text-[#9ca3af]">Assigned to:</span>
            {ticket.assignees.map((a, i) => (
              <span key={i} className="text-xs font-medium text-[#1A1A1A]">
                {a.memberName}{i < ticket.assignees.length - 1 ? "," : ""}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Description */}
      {ticket.description && (
        <div className="rounded-xl border border-[#F0F0F0] bg-[#FAFCFF] p-5">
          {ticket.descriptionFormat === "tiptap" ? (
            <TiptapEditor content={ticket.description} editable={false} />
          ) : (
            <div className="text-sm text-[#1A1A1A] whitespace-pre-wrap">{ticket.description}</div>
          )}
        </div>
      )}

      {/* Attachments */}
      {ticket.attachments.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-[#6b7280] uppercase tracking-wider mb-2">
            Attachments ({ticket.attachments.length})
          </h3>
          <div className="space-y-1.5">
            {ticket.attachments.map((a) => (
              <a
                key={a.id}
                href={a.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#F0F0F0] hover:bg-gray-50 transition text-sm"
              >
                <svg className="w-4 h-4 text-[#9ca3af] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                </svg>
                <span className="text-[#1A1A1A] truncate flex-1">{a.fileName}</span>
                <span className="text-[10px] text-[#9ca3af] shrink-0">{formatFileSize(a.fileSize)}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      <div>
        <h3 className="text-xs font-bold text-[#6b7280] uppercase tracking-wider mb-3">
          Comments ({ticket.comments.length})
        </h3>

        {ticket.comments.length > 0 && (
          <div className="space-y-3 mb-4">
            {ticket.comments.map((c) => (
              <div
                key={c.id}
                className={`p-3 rounded-lg ${
                  c.authorType === "client"
                    ? "bg-orange-50 border border-orange-100"
                    : "bg-gray-50 border border-[#F0F0F0]"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-[#1A1A1A]">
                    {c.authorName}
                    {c.authorType === "client" && (
                      <span className="ml-1 text-[10px] font-normal text-orange-600">(you)</span>
                    )}
                  </span>
                  <span className="text-[10px] text-[#9ca3af]">{timeAgo(c.createdAt)}</span>
                </div>
                <p className="text-sm text-[#1A1A1A] whitespace-pre-wrap">{c.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* Comment form — only visible for client_review tickets */}
        {canComment ? (
          <form onSubmit={handleSubmitComment} className="space-y-3 rounded-xl border border-[#F0F0F0] p-4">
            <p className="text-xs text-[#6b7280]">This ticket is awaiting your review. Leave a comment below.</p>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Your name *"
                value={commentName}
                onChange={(e) => setCommentName(e.target.value)}
                required
                className="px-3 py-2 text-sm border border-[#F0F0F0] rounded-lg outline-none focus:border-[#FF9500] transition"
              />
              <input
                type="email"
                placeholder="Your email"
                value={commentEmail}
                onChange={(e) => setCommentEmail(e.target.value)}
                className="px-3 py-2 text-sm border border-[#F0F0F0] rounded-lg outline-none focus:border-[#FF9500] transition"
              />
            </div>
            <textarea
              placeholder="Write your feedback..."
              value={commentContent}
              onChange={(e) => setCommentContent(e.target.value)}
              required
              rows={3}
              className="w-full px-3 py-2 text-sm border border-[#F0F0F0] rounded-lg outline-none focus:border-[#FF9500] transition resize-none"
            />
            {commentError && (
              <p className="text-xs text-red-600">{commentError}</p>
            )}
            <button
              type="submit"
              disabled={submitting || !commentName.trim() || !commentContent.trim()}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg transition disabled:opacity-50"
              style={{ backgroundColor: "#FF9500" }}
            >
              {submitting ? "Sending..." : "Send Comment"}
            </button>
          </form>
        ) : (
          <p className="text-xs text-[#9ca3af] italic">
            Comments are available when this ticket is in Client Review status.
          </p>
        )}
      </div>
    </div>
  );
}
