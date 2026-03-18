"use client";

import { useState, useEffect, useCallback } from "react";
import { ClientNote } from "@/types";
import NoteForm from "./NoteForm";

const TYPE_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  note: { icon: "N", color: "bg-gray-100 text-gray-600", label: "Note" },
  call: { icon: "C", color: "bg-[#B1D0FF] text-[#1a56db]", label: "Call" },
  email: { icon: "E", color: "bg-[#A69FFF]/20 text-[#6b5ce7]", label: "Email" },
  meeting: { icon: "M", color: "bg-[#BDFFE8] text-[#0d7a55]", label: "Meeting" },
  status_change: { icon: "S", color: "bg-[#FFF09E] text-[#92700c]", label: "Status Change" },
  package_change: { icon: "P", color: "bg-[#FFF3E0] text-[#FF9500]", label: "Package" },
  system: { icon: "!", color: "bg-gray-50 text-gray-400", label: "System" },
};

interface ClientNotesTimelineProps {
  clientId: number;
}

export default function ClientNotesTimeline({ clientId }: ClientNotesTimelineProps) {
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/notes`);
      if (res.ok) {
        setNotes(await res.json());
      }
    } catch {
      // Failed
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  function handleNoteSaved(note: ClientNote) {
    setNotes((prev) => [note, ...prev]);
  }

  async function handleDelete(noteId: number) {
    if (!confirm("Delete this note?")) return;
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/notes/${noteId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
      }
    } catch {
      // Failed
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div className="space-y-6">
      <NoteForm clientId={clientId} onSaved={handleNoteSaved} />

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Loading notes...</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No notes yet</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const typeStyle = TYPE_ICONS[note.noteType] || TYPE_ICONS.note;
            return (
              <div
                key={note.id}
                className="flex gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition group"
              >
                <div
                  className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${typeStyle.color}`}
                >
                  {typeStyle.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-700">
                      {note.author}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      {typeStyle.label}
                    </span>
                    <span className="text-xs text-gray-300">
                      {formatDate(note.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {note.content}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(note.id)}
                  className="shrink-0 text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
