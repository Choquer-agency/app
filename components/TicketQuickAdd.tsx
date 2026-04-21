"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Ticket, TicketStatus } from "@/types";
import { docToTicket } from "@/lib/ticket-mappers";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { StatusDot } from "./TicketStatusBadge";

interface TicketQuickAddProps {
  status: TicketStatus;
  onCreated: (ticket: Ticket) => void;
  projectId?: string;
  isPersonal?: boolean;
}

export default function TicketQuickAdd({ status, onCreated, projectId, isPersonal }: TicketQuickAddProps) {
  const [active, setActive] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const createTicketMutation = useMutation(api.tickets.create);
  const { userId: currentUserId } = useCurrentUser();

  useEffect(() => {
    if (active) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [active]);

  async function createTicket() {
    const trimmed = title.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    try {
      const doc = await createTicketMutation({
        title: trimmed,
        status,
        ...(projectId && { projectId: projectId as Id<"projects"> }),
        ...(isPersonal && { isPersonal: true }),
        ...(currentUserId && { createdById: currentUserId as Id<"teamMembers"> }),
      });
      if (doc) {
        setTitle("");
        setActive(false);
        onCreated(docToTicket(doc));
      }
    } catch {} finally {
      setSaving(false);
    }
  }

  if (!active) {
    return (
      <tr>
        <td colSpan={11}>
          <button
            onClick={() => setActive(true)}
            className="w-full text-left px-3 py-2.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-gray-50/50 transition flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add ticket
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-[var(--border)]">
      {/* Checkbox — empty */}
      <td className="px-2 py-3" />
      {/* Drag handle — empty */}
      <td className="px-1 py-3" />
      {/* Title input */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-2.5">
          <StatusDot status={status} size={10} />
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createTicket();
              if (e.key === "Escape") {
                setTitle("");
                setActive(false);
              }
            }}
            placeholder="Type a name for this ticket..."
            disabled={saving}
            className="flex-1 text-sm font-medium text-[var(--foreground)] bg-transparent outline-none placeholder:text-gray-300 disabled:opacity-50"
          />
        </div>
      </td>
      {/* Cancel + Save buttons in the comments/client area */}
      <td className="px-3 py-2" colSpan={8}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setTitle(""); setActive(false); }}
            className="px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] rounded-lg hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={createTicket}
            disabled={!title.trim() || saving}
            className="px-3 py-1.5 text-sm font-medium text-white bg-[var(--foreground)] rounded-lg hover:opacity-90 transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {saving ? "Saving..." : "Save"}
            {!saving && <span className="text-white/50 text-xs">&#9166;</span>}
          </button>
        </div>
      </td>
    </tr>
  );
}

// Mobile version
export function TicketQuickAddMobile({ status, onCreated, projectId, isPersonal }: { status: TicketStatus; onCreated: (ticket: Ticket) => void; projectId?: string; isPersonal?: boolean }) {
  const [active, setActive] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const createTicketMutation = useMutation(api.tickets.create);
  const { userId: currentUserId } = useCurrentUser();

  useEffect(() => {
    if (active) setTimeout(() => inputRef.current?.focus(), 0);
  }, [active]);

  async function createTicket() {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const doc = await createTicketMutation({
        title: trimmed,
        status,
        ...(projectId && { projectId: projectId as Id<"projects"> }),
        ...(isPersonal && { isPersonal: true }),
        ...(currentUserId && { createdById: currentUserId as Id<"teamMembers"> }),
      });
      if (doc) {
        setTitle("");
        setActive(false);
        onCreated(docToTicket(doc));
      }
    } catch {} finally {
      setSaving(false);
    }
  }

  if (!active) {
    return (
      <button
        onClick={() => setActive(true)}
        className="w-full text-left px-4 py-3 text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-gray-50/50 transition flex items-center gap-2"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add ticket
      </button>
    );
  }

  return (
    <div className="px-4 py-3 border-t border-[var(--border)]">
      <div className="flex items-center gap-2.5">
        <StatusDot status={status} size={10} />
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") createTicket();
            if (e.key === "Escape") { setActive(false); setTitle(""); }
          }}
          onBlur={() => {
            if (title.trim()) createTicket();
            else { setActive(false); setTitle(""); }
          }}
          placeholder="Type a name for this ticket..."
          disabled={saving}
          className="flex-1 text-sm font-medium text-[var(--foreground)] bg-transparent outline-none placeholder:text-gray-300 disabled:opacity-50"
        />
      </div>
    </div>
  );
}
