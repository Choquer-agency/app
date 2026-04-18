"use client";

import { useState } from "react";
import { Project } from "@/types";
import { useRouter } from "next/navigation";
import FilterDropdown from "./FilterDropdown";

interface ProjectTemplateSelectorProps {
  template: Project;
  clients: Array<{ id: number; name: string }>;
  onClose: () => void;
  onDuplicated: () => void;
}

export default function ProjectTemplateSelector({
  template,
  clients,
  onClose,
  onDuplicated,
}: ProjectTemplateSelectorProps) {
  const router = useRouter();
  const [name, setName] = useState(`${template.name} - `);
  const [clientId, setClientId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleDuplicate() {
    if (!name.trim() || !clientId || !startDate) {
      setError("All fields are required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/projects/${template.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          clientId,
          startDate,
        }),
      });

      if (res.ok) {
        const project = await res.json();
        onDuplicated();
        router.push(`/admin/projects/${project.id}`);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to duplicate template");
      }
    } catch {
      setError("Failed to duplicate template");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold mb-1">Use Template</h2>
        <p className="text-sm text-[var(--muted)] mb-4">
          Create a new project from &ldquo;{template.name}&rdquo; with {template.ticketCount || 0} tickets
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Project Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Client *</label>
            <FilterDropdown
              label=""
              value={clientId != null ? String(clientId) : ""}
              onChange={(v) => setClientId(v ? Number(v) : null)}
              options={[
                { value: "", label: "Select a client..." },
                ...clients.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
              fullWidth
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Start Date *</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg"
            />
            <p className="text-[10px] text-[var(--muted)] mt-1">
              All ticket dates will be calculated relative to this start date
            </p>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-500 mt-3">{error}</p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition"
          >
            Cancel
          </button>
          <button
            onClick={handleDuplicate}
            disabled={saving || !name.trim() || !clientId || !startDate}
            className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
