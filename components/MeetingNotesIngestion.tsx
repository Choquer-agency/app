"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { TeamMember } from "@/types";
import DatePicker from "./DatePicker";
import { StatusDot } from "./TicketStatusBadge";
import type { TicketStatus } from "@/types";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useClients } from "@/hooks/useClients";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface ClientOption {
  id: number | string;
  name: string;
}

interface DuplicateTicket {
  ticketId: number;
  ticketNumber: string;
  title: string;
  status: string;
}

interface ExtractedItem {
  task: string;
  description: string;
  assigneeName: string;
  clientName: string;
  dueDate: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  contextFromTranscript: string;
  resolvedAssigneeId: number | null;
  resolvedClientId: number | null;
  duplicates: DuplicateTicket[];
}

interface EditableItem extends ExtractedItem {
  approved: boolean;
  editedTitle: string;
  editedDescription: string;
  editedAssigneeId: number | null;
  editedClientId: number | null;
  editedDueDate: string | null;
  editedPriority: "low" | "normal" | "high" | "urgent";
}

interface CreatedTicket {
  ticketId: number;
  ticketNumber: string;
  title: string;
}

interface MeetingNote {
  id: number;
  team_member_id: number;
  member_name: string;
  meeting_date: string;
  summary: string;
  transcript: string;
  raw_extraction: unknown;
  created_at: string;
  interaction_type?: string;
  client_id?: number | null;
  client_name?: string | null;
}

type InteractionType = "team_meeting" | "client_meeting" | "client_email" | "client_phone_call" | "general_notes";

const INTERACTION_TYPES: { value: InteractionType; label: string; icon: string }[] = [
  { value: "team_meeting", label: "Team Meeting", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  { value: "client_meeting", label: "Client Meeting", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M9 20H2v-2a3 3 0 015.356-1.857M12 14a4 4 0 100-8 4 4 0 000 8z" },
  { value: "client_email", label: "Client Email", icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
  { value: "client_phone_call", label: "Phone Call", icon: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" },
  { value: "general_notes", label: "General Notes", icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" },
];

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Urgent", color: "text-red-700" },
  { value: "high", label: "High", color: "text-orange-700" },
  { value: "normal", label: "Normal", color: "text-blue-700" },
  { value: "low", label: "Low", color: "text-gray-600" },
];

export default function MeetingNotesIngestion({ roleLevel, teamMemberId }: { roleLevel?: string; teamMemberId?: string | number }) {
  const isAdmin = roleLevel === "owner" || roleLevel === "c_suite";

  // Data — from Convex hooks
  const { teamMembers: allTeamMembers } = useTeamMembers();
  const { clients: allClients } = useClients();
  const removeMeetingNote = useMutation(api.meetingNotes.remove);

  const teamMembers = useMemo(() => {
    let active = allTeamMembers.filter((m) => m.active);
    if (!isAdmin && teamMemberId) {
      active = active.filter((m) => String(m.id) === String(teamMemberId));
    }
    return active;
  }, [allTeamMembers, isAdmin, teamMemberId]);

  const clients: ClientOption[] = useMemo(
    () => allClients.map((c) => ({ id: c.id, name: c.name })),
    [allClients]
  );

  // Input
  const [interactionType, setInteractionType] = useState<InteractionType>("team_meeting");
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const memberDropdownRef = useRef<HTMLDivElement>(null);
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split("T")[0]);
  const [transcript, setTranscript] = useState("");

  // Extraction
  const [extracting, setExtracting] = useState(false);
  const [summary, setSummary] = useState("");
  const [items, setItems] = useState<EditableItem[]>([]);
  const [meetingNoteId, setMeetingNoteId] = useState<number | null>(null);

  // Creation
  const [creating, setCreating] = useState(false);
  const [createdTickets, setCreatedTickets] = useState<CreatedTicket[]>([]);

  // Past notes
  const [pastNotes, setPastNotes] = useState<MeetingNote[]>([]);
  const [showPastNotes, setShowPastNotes] = useState(false);
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (memberDropdownRef.current && !memberDropdownRef.current.contains(e.target as Node)) {
        setMemberDropdownOpen(false);
      }
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
    }
    if (memberDropdownOpen || clientDropdownOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [memberDropdownOpen, clientDropdownOpen]);

  // Auto-select for non-admin employees
  useEffect(() => {
    if (!isAdmin && teamMemberId && teamMembers.length > 0 && selectedMemberIds.length === 0) {
      const selfId = teamMembers[0]?.id;
      if (selfId) setSelectedMemberIds([Number(selfId)]);
    }
  }, [isAdmin, teamMemberId, teamMembers, selectedMemberIds.length]);

  // Load past notes based on interaction type and selection
  useEffect(() => {
    const isClientType = ["client_meeting", "client_email", "client_phone_call"].includes(interactionType);

    if (isClientType && selectedClientId) {
      fetch(`/api/admin/meeting-notes?clientId=${selectedClientId}`)
        .then((r) => r.ok ? r.json() : [])
        .then((notes: MeetingNote[]) => {
          notes.sort((a, b) => new Date(b.meeting_date).getTime() - new Date(a.meeting_date).getTime());
          setPastNotes(notes);
        })
        .catch(() => setPastNotes([]));
    } else if (interactionType === "general_notes") {
      fetch("/api/admin/meeting-notes")
        .then((r) => r.ok ? r.json() : [])
        .then((notes: MeetingNote[]) => {
          const generalOnly = notes.filter((n) => n.interaction_type === "general_notes");
          generalOnly.sort((a, b) => new Date(b.meeting_date).getTime() - new Date(a.meeting_date).getTime());
          setPastNotes(generalOnly);
        })
        .catch(() => setPastNotes([]));
    } else if (selectedMemberIds.length > 0) {
      // Team meeting — fetch for all selected members
      Promise.all(
        selectedMemberIds.map((id) =>
          fetch(`/api/admin/meeting-notes?memberId=${id}`)
            .then((r) => r.ok ? r.json() : [])
            .catch(() => [])
        )
      ).then((results) => {
        const all = (results as MeetingNote[][]).flat();
        const unique = Array.from(new Map(all.map((n) => [n.id, n])).values());
        unique.sort((a, b) => new Date(b.meeting_date).getTime() - new Date(a.meeting_date).getTime());
        setPastNotes(unique);
      });
    } else {
      setPastNotes([]);
    }
  }, [selectedMemberIds, selectedClientId, interactionType]);

  function toggleMember(memberId: number) {
    setSelectedMemberIds((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  }

  async function handleDeleteNote(noteId: number) {
    if (!confirm("Delete this meeting note?")) return;
    try {
      await removeMeetingNote({ id: String(noteId) as Id<"meetingNotes"> });
      setPastNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch {
      // Failed silently
    }
  }

  async function handleExtract() {
    const isClientType = ["client_meeting", "client_email", "client_phone_call"].includes(interactionType);
    const isGeneral = interactionType === "general_notes";

    // Validate based on type
    if (interactionType === "team_meeting" && selectedMemberIds.length === 0) return;
    if (isClientType && !selectedClientId) return;
    if (!transcript.trim()) return;

    setExtracting(true);
    setSummary("");
    setItems([]);
    setCreatedTickets([]);

    try {
      // 1. Save transcript
      const saveRes = await fetch("/api/admin/meeting-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamMemberIds: isClientType || isGeneral ? [] : selectedMemberIds,
          transcript: transcript.trim(),
          meetingDate,
          source: "manual",
          interactionType,
          clientId: isClientType ? selectedClientId : undefined,
        }),
      });

      if (!saveRes.ok) throw new Error("Failed to save transcript");
      const saved = await saveRes.json();
      setMeetingNoteId(saved.id);

      // 2. Extract action items
      const extractRes = await fetch("/api/admin/meeting-notes/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingNoteId: saved.id,
          transcript: transcript.trim(),
          teamMemberId: interactionType === "team_meeting" ? selectedMemberIds[0] : undefined,
          interactionType,
          clientId: isClientType ? selectedClientId : undefined,
        }),
      });

      if (!extractRes.ok) {
        const err = await extractRes.json();
        throw new Error(err.error || "Extraction failed");
      }

      const result = await extractRes.json();
      setSummary(result.summary);

      // Convert to editable items
      const editableItems: EditableItem[] = (result.items as ExtractedItem[]).map((item) => ({
        ...item,
        approved: true, // Default to approved
        editedTitle: item.task,
        editedDescription: item.description,
        editedAssigneeId: item.resolvedAssigneeId,
        editedClientId: item.resolvedClientId,
        editedDueDate: item.dueDate,
        editedPriority: item.priority,
      }));

      setItems(editableItems);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  async function handleCreateTickets() {
    const approved = items.filter((item) => item.approved);
    if (approved.length === 0) return;

    setCreating(true);

    try {
      const res = await fetch("/api/admin/meeting-notes/create-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingNoteId,
          items: approved.map((item) => ({
            title: item.editedTitle,
            description: item.editedDescription,
            assigneeId: item.editedAssigneeId,
            clientId: item.editedClientId,
            dueDate: item.editedDueDate,
            priority: item.editedPriority,
          })),
        }),
      });

      if (!res.ok) throw new Error("Failed to create tickets");
      const result = await res.json();
      setCreatedTickets(result.created as CreatedTicket[]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to create tickets");
    } finally {
      setCreating(false);
    }
  }

  function toggleItem(index: number) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, approved: !item.approved } : item
      )
    );
  }

  function updateItem(index: number, field: string, value: unknown) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  }

  const approvedCount = items.filter((i) => i.approved).length;

  const inputClass =
    "w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent";

  return (
    <div className="space-y-6">
      {/* Created tickets success state */}
      {createdTickets.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <h3 className="font-semibold text-green-800 mb-3">
            {createdTickets.length} ticket{createdTickets.length > 1 ? "s" : ""} created
          </h3>
          <div className="space-y-1.5">
            {createdTickets.map((t) => (
              <a
                key={t.ticketId}
                href={`/admin/tickets?ticket=${t.ticketId}`}
                className="flex items-center gap-2 text-sm text-green-700 hover:text-green-900"
              >
                <span className="font-mono font-medium">{t.ticketNumber}</span>
                <span>{t.title}</span>
              </a>
            ))}
          </div>
          <button
            onClick={() => {
              setCreatedTickets([]);
              setItems([]);
              setSummary("");
              setTranscript("");
              setMeetingNoteId(null);
            }}
            className="mt-3 text-sm text-green-600 hover:text-green-800"
          >
            Start new meeting note
          </button>
        </div>
      )}

      {/* Input section */}
      {createdTickets.length === 0 && items.length === 0 && (
        <div className="bg-white rounded-xl border border-[var(--border)] p-6 space-y-4">
          {/* Interaction type selector */}
          <div className="flex flex-wrap gap-2">
            {INTERACTION_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => {
                  setInteractionType(type.value);
                  setSelectedMemberIds([]);
                  setSelectedClientId(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition ${
                  interactionType === type.value
                    ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                    : "bg-white text-[var(--muted)] border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--foreground)]"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={type.icon} />
                </svg>
                {type.label}
              </button>
            ))}
          </div>

          {/* Context fields — conditional on interaction type */}
          <div className={`grid ${interactionType === "general_notes" ? "grid-cols-1" : "grid-cols-2"} gap-4`}>
            {/* Team member selector (team_meeting only) */}
            {interactionType === "team_meeting" && (
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Meeting with
                </label>
                <div className="relative" ref={memberDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setMemberDropdownOpen(!memberDropdownOpen)}
                    className={`${inputClass} text-left flex items-center gap-2 min-h-[42px] flex-wrap`}
                  >
                    {selectedMemberIds.length === 0 ? (
                      <span className="text-[var(--muted)]">Select team members...</span>
                    ) : (
                      selectedMemberIds.map((id) => {
                        const m = teamMembers.find((t) => t.id === id);
                        return m ? (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--accent-light)] text-[var(--accent)] rounded-md text-xs font-medium"
                          >
                            {m.name.split(" ")[0]}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleMember(id); }}
                              className="hover:text-red-600 ml-0.5"
                            >
                              &times;
                            </button>
                          </span>
                        ) : null;
                      })
                    )}
                  </button>
                  {memberDropdownOpen && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-[var(--border)] rounded-lg shadow-lg py-1 max-h-[200px] overflow-y-auto">
                      {teamMembers.map((m) => {
                        const selected = selectedMemberIds.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => { toggleMember(m.id); }}
                            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 hover:bg-gray-50 transition ${
                              selected ? "bg-[var(--accent-light)]" : ""
                            }`}
                          >
                            {m.profilePicUrl ? (
                              <img src={m.profilePicUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500">
                                {m.name.charAt(0)}
                              </div>
                            )}
                            <span className="flex-1">{m.name}</span>
                            {selected && (
                              <svg className="w-4 h-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Client selector (client types only) */}
            {["client_meeting", "client_email", "client_phone_call"].includes(interactionType) && (
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Client
                </label>
                <div className="relative" ref={clientDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setClientDropdownOpen(!clientDropdownOpen)}
                    className={`${inputClass} text-left flex items-center gap-2 min-h-[42px]`}
                  >
                    {!selectedClientId ? (
                      <span className="text-[var(--muted)]">Select client...</span>
                    ) : (
                      <span className="text-sm text-[var(--foreground)]">
                        {clients.find((c) => String(c.id) === String(selectedClientId))?.name || "Unknown"}
                      </span>
                    )}
                  </button>
                  {clientDropdownOpen && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-[var(--border)] rounded-lg shadow-lg py-1 max-h-[200px] overflow-y-auto">
                      {clients.map((c) => {
                        const selected = String(c.id) === String(selectedClientId);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setSelectedClientId(String(c.id));
                              setClientDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition ${
                              selected ? "bg-[var(--accent-light)] text-[var(--accent)]" : ""
                            }`}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Date picker (all types) */}
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Date
              </label>
              <DatePicker
                value={meetingDate}
                onChange={(date) => setMeetingDate(date || new Date().toISOString().split("T")[0])}
              />
            </div>
          </div>

          {/* Transcript / content textarea */}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              {interactionType === "team_meeting" && "Paste transcript"}
              {interactionType === "client_meeting" && "Meeting notes or transcript"}
              {interactionType === "client_email" && "Email body"}
              {interactionType === "client_phone_call" && "Call notes"}
              {interactionType === "general_notes" && "Notes"}
            </label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder={
                interactionType === "team_meeting"
                  ? "Paste your meeting transcript here..."
                  : interactionType === "client_meeting"
                  ? "Paste meeting notes, transcript, or Loom summary..."
                  : interactionType === "client_email"
                  ? "Paste the email thread or body here..."
                  : interactionType === "client_phone_call"
                  ? "Paste call notes, transcription, or summary..."
                  : "Paste notes, voice memo, or any text to extract action items..."
              }
              rows={12}
              className={`${inputClass} resize-y font-mono text-xs leading-relaxed`}
            />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--muted)]">
              {transcript.length > 0
                ? `${transcript.split(/\s+/).length} words`
                : interactionType === "client_email"
                ? "Paste the email above"
                : "Paste content above to extract action items"}
            </p>
            <button
              onClick={handleExtract}
              disabled={
                (interactionType === "team_meeting" && selectedMemberIds.length === 0) ||
                (["client_meeting", "client_email", "client_phone_call"].includes(interactionType) && !selectedClientId) ||
                !transcript.trim() ||
                extracting
              }
              className="px-5 py-2.5 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {extracting ? "Extracting..." : "Extract Action Items"}
            </button>
          </div>
        </div>
      )}

      {/* Extracting state */}
      {extracting && (
        <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-[var(--muted)]">
            Analyzing transcript and extracting action items...
          </p>
        </div>
      )}

      {/* Review section */}
      {items.length > 0 && createdTickets.length === 0 && (
        <div className="space-y-4">
          {/* Summary */}
          {summary && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm font-medium text-blue-800 mb-1">Summary</p>
              <p className="text-sm text-blue-700">{summary}</p>
            </div>
          )}

          {/* Action items header */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[var(--foreground)]">
              {items.length} action item{items.length > 1 ? "s" : ""} found
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-sm text-[var(--muted)]">
                {approvedCount} selected
              </span>
              <button
                onClick={handleCreateTickets}
                disabled={approvedCount === 0 || creating}
                className="px-4 py-2 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                {creating
                  ? "Creating..."
                  : `Create ${approvedCount} Ticket${approvedCount !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>

          {/* Item cards */}
          {items.map((item, index) => (
            <div
              key={index}
              className={`bg-white rounded-xl border ${
                item.approved
                  ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/20"
                  : "border-[var(--border)] opacity-60"
              } p-5 space-y-3 transition`}
            >
              {/* Header row: approve/dismiss + title */}
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggleItem(index)}
                  className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
                    item.approved
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {item.approved && (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={item.editedTitle}
                    onChange={(e) => updateItem(index, "editedTitle", e.target.value)}
                    className="w-full text-sm font-semibold text-[var(--foreground)] border-none p-0 focus:outline-none focus:ring-0 bg-transparent"
                  />
                </div>
              </div>

              {/* Duplicates warning */}
              {item.duplicates.length > 0 && (
                <div className="ml-9 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-amber-800 mb-1.5">
                    Possible existing ticket{item.duplicates.length > 1 ? "s" : ""}:
                  </p>
                  {item.duplicates.map((dup) => (
                    <a
                      key={dup.ticketId}
                      href={`/admin/tickets?ticket=${dup.ticketId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-amber-700 hover:text-amber-900 py-0.5"
                    >
                      <StatusDot status={dup.status as TicketStatus} />
                      <span className="font-mono">{dup.ticketNumber}</span>
                      <span className="truncate">{dup.title}</span>
                    </a>
                  ))}
                </div>
              )}

              {/* Fields */}
              {item.approved && (
                <div className="ml-9 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Assignee */}
                    <div>
                      <label className="block text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider mb-1">
                        Assignee
                      </label>
                      <select
                        value={item.editedAssigneeId ?? ""}
                        onChange={(e) =>
                          updateItem(index, "editedAssigneeId", e.target.value ? Number(e.target.value) : null)
                        }
                        className="w-full px-2 py-1.5 text-xs border border-[var(--border)] rounded-lg bg-white"
                      >
                        <option value="">Unassigned</option>
                        {teamMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Client */}
                    <div>
                      <label className="block text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider mb-1">
                        Client
                      </label>
                      <select
                        value={item.editedClientId ?? ""}
                        onChange={(e) =>
                          updateItem(index, "editedClientId", e.target.value ? Number(e.target.value) : null)
                        }
                        className="w-full px-2 py-1.5 text-xs border border-[var(--border)] rounded-lg bg-white"
                      >
                        <option value="">Internal</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Due Date */}
                    <div>
                      <label className="block text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider mb-1">
                        Due Date
                      </label>
                      <input
                        type="date"
                        value={item.editedDueDate || ""}
                        onChange={(e) => updateItem(index, "editedDueDate", e.target.value || null)}
                        className="w-full px-2 py-1.5 text-xs border border-[var(--border)] rounded-lg bg-white"
                      />
                    </div>

                    {/* Priority */}
                    <div>
                      <label className="block text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider mb-1">
                        Priority
                      </label>
                      <select
                        value={item.editedPriority}
                        onChange={(e) =>
                          updateItem(index, "editedPriority", e.target.value)
                        }
                        className="w-full px-2 py-1.5 text-xs border border-[var(--border)] rounded-lg bg-white"
                      >
                        {PRIORITY_OPTIONS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider mb-1">
                      Description
                    </label>
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => updateItem(index, "editedDescription", e.currentTarget.textContent || "")}
                      className="w-full px-2 py-1.5 text-xs border border-[var(--border)] rounded-lg bg-white min-h-[40px] whitespace-pre-wrap outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                    >
                      {item.editedDescription}
                    </div>
                  </div>

                </div>
              )}
            </div>
          ))}

          {/* Bottom action bar */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => {
                setItems([]);
                setSummary("");
              }}
              className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Back to transcript
            </button>
            <button
              onClick={handleCreateTickets}
              disabled={approvedCount === 0 || creating}
              className="px-5 py-2.5 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {creating
                ? "Creating..."
                : `Create ${approvedCount} Ticket${approvedCount !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}

      {/* Past notes */}
      {pastNotes.length > 0 && createdTickets.length === 0 && items.length === 0 && (
        <div>
          <button
            onClick={() => setShowPastNotes(!showPastNotes)}
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] flex items-center gap-1"
          >
            <svg
              className={`w-4 h-4 transition ${showPastNotes ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Past notes ({pastNotes.length})
          </button>

          {showPastNotes && (
            <div className="mt-3 space-y-2">
              {pastNotes.map((note) => (
                <div
                  key={note.id}
                  className="bg-white rounded-lg border border-[var(--border)] overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedNoteId(expandedNoteId === note.id ? null : note.id)
                    }
                    className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-[var(--foreground)]">
                        {new Date(note.meeting_date).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      {note.interaction_type && note.interaction_type !== "team_meeting" && (
                        <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-[var(--muted)]">
                          {note.interaction_type === "client_meeting" ? "Client Mtg" : note.interaction_type === "client_email" ? "Email" : note.interaction_type === "client_phone_call" ? "Phone" : note.interaction_type === "general_notes" ? "General" : "Meeting"}
                        </span>
                      )}
                      {note.client_name && (
                        <span className="text-xs text-[var(--accent)] font-medium">{note.client_name}</span>
                      )}
                      {note.member_name && (!note.interaction_type || note.interaction_type === "team_meeting") && (
                        <span className="text-xs text-[var(--muted)]">{note.member_name}</span>
                      )}
                      {note.summary && (
                        <span className="text-xs text-[var(--muted)] truncate max-w-[200px]">
                          {note.summary}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}
                        className="p-1 text-[var(--muted)] hover:text-red-600 transition"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      <svg
                        className={`w-4 h-4 text-[var(--muted)] transition ${
                          expandedNoteId === note.id ? "rotate-180" : ""
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  {expandedNoteId === note.id && (
                    <div className="px-4 pb-4 border-t border-[var(--border)]">
                      <pre className="text-xs text-[var(--muted)] whitespace-pre-wrap mt-3 max-h-[300px] overflow-y-auto">
                        {note.transcript}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
