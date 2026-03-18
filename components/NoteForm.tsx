"use client";

import { useState } from "react";
import { ClientNote } from "@/types";

interface NoteFormProps {
  clientId: number;
  onSaved: (note: ClientNote) => void;
}

const NOTE_TYPES = [
  { value: "note", label: "Note" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
];

export default function NoteForm({ clientId, onSaved }: NoteFormProps) {
  const [content, setContent] = useState("");
  const [noteType, setNoteType] = useState("note");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), noteType }),
      });

      if (res.ok) {
        const note = await res.json();
        onSaved(note);
        setContent("");
        setNoteType("note");
      }
    } catch {
      // Failed
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        {NOTE_TYPES.map((type) => (
          <button
            key={type.value}
            type="button"
            onClick={() => setNoteType(type.value)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition ${
              noteType === type.value
                ? "bg-[#FF9500] text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Add a note..."
        rows={3}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent resize-none"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!content.trim() || submitting}
          className="px-4 py-2 text-sm font-medium text-white bg-[#FF9500] rounded-lg hover:opacity-90 transition disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Add Note"}
        </button>
      </div>
    </form>
  );
}
