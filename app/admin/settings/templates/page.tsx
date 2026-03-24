"use client";

import { useState, useEffect } from "react";
import { Project } from "@/types";
import TemplateEditorView from "@/components/TemplateEditorView";

export default function TemplatesSettingsPage() {
  const [templates, setTemplates] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/projects?isTemplate=true")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setTemplates(data);
        if (data.length > 0 && !selectedId) setSelectedId(data[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-16 text-[var(--muted)]">
        <p className="text-sm">No templates yet.</p>
        <p className="text-xs mt-1">Create a template from the Projects page first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Template selector tabs */}
      <div className="flex items-center gap-3 flex-wrap">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedId(t.id)}
            className={`px-4 py-2 text-sm rounded-lg border transition ${
              selectedId === t.id
                ? "border-[var(--accent)] bg-[var(--accent)] text-white font-medium"
                : "border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--accent)]"
            }`}
          >
            {t.name}
            <span className="ml-1.5 opacity-70">({t.ticketCount || 0})</span>
          </button>
        ))}
      </div>

      {/* Template editor */}
      {selectedId && (
        <TemplateEditorView key={selectedId} projectId={selectedId} />
      )}
    </div>
  );
}
