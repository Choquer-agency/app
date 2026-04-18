"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Project, ProjectStatus, Ticket, ProjectGroup, isOverdueEligible } from "@/types";
import TicketListView from "./TicketListView";
import TemplateEditorView from "./TemplateEditorView";
import GanttView from "./GanttView";
import { friendlyDate } from "@/lib/date-format";
import FilterDropdown from "./FilterDropdown";

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
];

type ProjectHealth = "on_target" | "falling_behind" | "far_behind";

function getProjectHealth(tickets: Ticket[]): { health: ProjectHealth; overdueDays: number; overdueCount: number } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let maxOverdueDays = 0;
  let overdueCount = 0;

  for (const t of tickets) {
    if (!t.dueDate || !isOverdueEligible(t.status)) continue;
    const due = new Date(t.dueDate + "T00:00:00");
    if (due < now) {
      overdueCount++;
      const days = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      if (days > maxOverdueDays) maxOverdueDays = days;
    }
  }

  if (maxOverdueDays >= 7) return { health: "far_behind", overdueDays: maxOverdueDays, overdueCount };
  if (overdueCount > 0) return { health: "falling_behind", overdueDays: maxOverdueDays, overdueCount };
  return { health: "on_target", overdueDays: 0, overdueCount: 0 };
}

const HEALTH_CONFIG: Record<ProjectHealth, { label: string; color: string; bgClass: string; textClass: string }> = {
  on_target: { label: "On Target", color: "#22c55e", bgClass: "bg-green-50", textClass: "text-green-700" },
  falling_behind: { label: "Falling Behind", color: "#f59e0b", bgClass: "bg-amber-50", textClass: "text-amber-700" },
  far_behind: { label: "Far Behind", color: "#ef4444", bgClass: "bg-red-50", textClass: "text-red-700" },
};

export default function ProjectDetailView({ projectId }: { projectId: number }) {
  const [project, setProject] = useState<Project | null>(null);
  const [projectTickets, setProjectTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showStageManager, setShowStageManager] = useState(false);
  const [stages, setStages] = useState<ProjectGroup[]>([]);
  const [newStageName, setNewStageName] = useState("");
  const [editingStageId, setEditingStageId] = useState<number | null>(null);
  const [editStageName, setEditStageName] = useState("");
  const [stageVersion, setStageVersion] = useState(0);
  const [viewMode, setViewMode] = useState<"list" | "schedule">("list");
  const [dragStageId, setDragStageId] = useState<number | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Edit form
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<ProjectStatus>("active");
  const [editStartDate, setEditStartDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      const [projRes, ticketsRes] = await Promise.all([
        fetch(`/api/admin/projects/${projectId}`),
        fetch(`/api/admin/tickets?projectId=${projectId}&archived=false`),
      ]);
      if (projRes.ok) {
        const data = await projRes.json();
        setProject(data);
        setEditName(data.name);
        setEditDescription(data.description || "");
        setEditStatus(data.status);
        setEditStartDate(data.startDate || "");
        setEditDueDate(data.dueDate || "");
      }
      if (ticketsRes.ok) {
        const data = await ticketsRes.json();
        setProjectTickets(Array.isArray(data) ? data : data.tickets || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim(),
          status: editStatus,
          startDate: editStartDate || null,
          dueDate: editDueDate || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setProject(data);
        setEditing(false);
      }
    } catch {} finally {
      setSaving(false);
    }
  }

  const STAGE_COLORS = ["#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#6B7280"];

  async function fetchStages() {
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/groups`);
      if (res.ok) setStages(await res.json());
    } catch {}
  }

  function bumpStageVersion() {
    setStageVersion((v) => v + 1);
  }

  async function handleAddStage() {
    if (!newStageName.trim()) return;
    // Pick a color not yet used, or cycle through
    const usedColors = new Set(stages.map((s) => s.color));
    const color = STAGE_COLORS.find((c) => !usedColors.has(c)) || STAGE_COLORS[stages.length % STAGE_COLORS.length];
    try {
      await fetch(`/api/admin/projects/${projectId}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newStageName.trim(), color, sortOrder: stages.length }),
      });
      setNewStageName("");
      fetchStages();
      bumpStageVersion();
    } catch {}
  }

  async function handleUpdateStage(stageId: number) {
    if (!editStageName.trim()) return;
    try {
      await fetch(`/api/admin/projects/${projectId}/groups/${stageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editStageName.trim() }),
      });
      setEditingStageId(null);
      fetchStages();
      bumpStageVersion();
    } catch {}
  }

  async function handleDeleteStage(stageId: number) {
    if (!confirm("Delete this stage? Tickets in this stage will become ungrouped.")) return;
    try {
      await fetch(`/api/admin/projects/${projectId}/groups/${stageId}`, { method: "DELETE" });
      fetchStages();
      bumpStageVersion();
    } catch {}
  }

  async function handleStageDrop(droppedOnId: number) {
    if (dragStageId === null || dragStageId === droppedOnId) {
      setDragStageId(null);
      setDragOverStageId(null);
      return;
    }
    const oldIndex = stages.findIndex((s) => s.id === dragStageId);
    const newIndex = stages.findIndex((s) => s.id === droppedOnId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...stages];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    setStages(reordered);
    setDragStageId(null);
    setDragOverStageId(null);

    try {
      await fetch(`/api/admin/projects/${projectId}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: reordered.map((s) => s.id) }),
      });
      bumpStageVersion();
    } catch {
      fetchStages();
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this project? This will permanently remove the project and ALL its tickets, subtasks, and dependencies. This cannot be undone.")) return;
    try {
      await fetch(`/api/admin/projects/${projectId}`, { method: "DELETE" });
      window.location.href = "/admin/tickets";
    } catch {}
  }

  async function handleStatusChange(status: ProjectStatus) {
    setMenuOpen(false);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json();
        setProject(data);
      }
    } catch {}
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        {/* Skeleton header */}
        <div className="bg-white border border-[var(--border)] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-6 w-48 bg-gray-200 rounded" />
            <div className="h-5 w-20 bg-gray-100 rounded-full" />
          </div>
          <div className="h-4 w-72 bg-gray-100 rounded mb-3" />
          <div className="flex gap-6">
            <div className="h-4 w-24 bg-gray-100 rounded" />
            <div className="h-4 w-24 bg-gray-100 rounded" />
            <div className="h-4 w-32 bg-gray-100 rounded" />
          </div>
          <div className="mt-4 h-2 w-full bg-gray-100 rounded-full" />
        </div>
        {/* Skeleton ticket rows */}
        <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="h-5 w-32 bg-gray-200 rounded-full" />
          </div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-50">
              <div className="h-4 w-4 bg-gray-100 rounded" />
              <div className="h-4 flex-1 bg-gray-100 rounded" style={{ maxWidth: 200 + i * 30 }} />
              <div className="h-4 w-16 bg-gray-100 rounded ml-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return <div className="text-center py-12 text-[var(--muted)]">Project not found</div>;
  }

  const progress = project.ticketCount
    ? Math.round(((project.completedTicketCount || 0) / project.ticketCount) * 100)
    : 0;

  const { health, overdueCount } = getProjectHealth(projectTickets);
  const healthConfig = HEALTH_CONFIG[health];

  return (
    <div className="space-y-6">
      {/* Project Header */}
      <div className="bg-white border border-[var(--border)] rounded-xl p-5">
        {editing ? (
          <div className="space-y-3">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full text-lg font-bold px-3 py-2 border border-[var(--border)] rounded-lg"
              autoFocus
            />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={2}
              placeholder="Project description..."
              className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg resize-none"
            />
            <div className="flex items-center gap-3 flex-wrap">
              <FilterDropdown
                label="Status"
                value={editStatus}
                onChange={(v) => setEditStatus(v as ProjectStatus)}
                options={STATUS_OPTIONS.map((s) => ({ value: String(s.value), label: s.label }))}
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-[var(--muted)]">Start:</label>
                <input
                  type="date"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  className="px-2 py-1 text-sm border border-[var(--border)] rounded-lg"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-[var(--muted)]">Due:</label>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  className="px-2 py-1 text-sm border border-[var(--border)] rounded-lg"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold text-[var(--foreground)]">
                  {project.clientName
                    ? (project.name.endsWith("-") || project.name.endsWith("- ")
                      ? `${project.name}${project.name.endsWith(" ") ? "" : " "}${project.clientName}`
                      : `${project.name} - ${project.clientName}`)
                    : project.name}
                </h1>
                {project.description && (
                  <p className="text-sm text-[var(--muted)] mt-1">{project.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {project.isTemplate && (
                  <span className="px-2.5 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">
                    Template
                  </span>
                )}
                {/* Three-dot menu */}
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-gray-100 rounded-lg transition"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-[var(--border)] rounded-lg shadow-lg z-50 py-1">
                      <button
                        onClick={() => { setMenuOpen(false); setEditing(true); }}
                        className="w-full text-left px-3 py-2 text-sm text-[var(--foreground)] hover:bg-gray-50 transition flex items-center gap-2"
                      >
                        <svg className="w-3.5 h-3.5 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
                        </svg>
                        Edit Project
                      </button>
                      <button
                        onClick={() => { setMenuOpen(false); fetchStages(); setShowStageManager(true); }}
                        className="w-full text-left px-3 py-2 text-sm text-[var(--foreground)] hover:bg-gray-50 transition flex items-center gap-2"
                      >
                        <svg className="w-3.5 h-3.5 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
                        </svg>
                        Manage Stages
                      </button>
                      <div className="border-t border-[var(--border)] my-1" />
                      {STATUS_OPTIONS.map((s) => (
                        <button
                          key={s.value}
                          onClick={() => handleStatusChange(s.value)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition ${
                            project.status === s.value ? "font-semibold text-[var(--accent)]" : "text-[var(--foreground)]"
                          }`}
                        >
                          Mark as {s.label}
                        </button>
                      ))}
                      <div className="border-t border-[var(--border)] my-1" />
                      <button
                        onClick={() => { setMenuOpen(false); handleDelete(); }}
                        className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition"
                      >
                        Delete Project
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Progress + health + dates bar */}
            <div className="flex items-center gap-6 mt-4 flex-wrap">
              <div className="flex-1 max-w-xs min-w-[200px]">
                <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-1">
                  <span>{project.completedTicketCount || 0} / {project.ticketCount || 0} tickets complete</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Project health indicator */}
              {!project.isTemplate && project.status === "active" && (
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${healthConfig.bgClass} ${healthConfig.textClass}`}>
                  <span className="relative flex h-2.5 w-2.5">
                    <span
                      className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        health === "on_target" ? "animate-ping" : ""
                      }`}
                      style={{ backgroundColor: healthConfig.color }}
                    />
                    <span
                      className="relative inline-flex rounded-full h-2.5 w-2.5"
                      style={{ backgroundColor: healthConfig.color }}
                    />
                  </span>
                  {healthConfig.label}
                  {overdueCount > 0 && (
                    <span className="opacity-70">({overdueCount} overdue)</span>
                  )}
                </div>
              )}

              {project.startDate && (
                <span className="text-xs text-[var(--muted)]">
                  Start: {friendlyDate(project.startDate)}
                </span>
              )}
              {project.dueDate && (
                <span className="text-xs text-[var(--muted)]">
                  Due: {friendlyDate(project.dueDate)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Template editor or regular ticket list / schedule */}
      {project.isTemplate ? (
        <TemplateEditorView projectId={projectId} />
      ) : (
        <>
          {/* View toggle */}
          <div className="flex items-center gap-1 mb-3 bg-gray-100 rounded-lg p-0.5 w-fit">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition ${
                viewMode === "list" ? "bg-white shadow-sm text-[var(--foreground)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
              </svg>
              List
            </button>
            <button
              onClick={() => setViewMode("schedule")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition ${
                viewMode === "schedule" ? "bg-white shadow-sm text-[var(--foreground)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
              Schedule
            </button>
          </div>

          {viewMode === "list" ? (
            <TicketListView key={stageVersion} projectId={projectId} />
          ) : (
            <GanttView projectId={projectId} />
          )}
        </>
      )}

      {/* Stage Manager Modal */}
      {showStageManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowStageManager(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">Manage Stages</h3>
              <button onClick={() => setShowStageManager(false)} className="p-1 hover:bg-gray-100 rounded transition">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Existing stages */}
            <div className="space-y-1.5 mb-4">
              {stages.length === 0 && (
                <p className="text-sm text-[var(--muted)] text-center py-3">No stages yet</p>
              )}
              {stages.map((stage) => (
                <div
                  key={stage.id}
                  draggable
                  onDragStart={() => setDragStageId(stage.id)}
                  onDragOver={(e) => { e.preventDefault(); setDragOverStageId(stage.id); }}
                  onDrop={() => handleStageDrop(stage.id)}
                  onDragEnd={() => { setDragStageId(null); setDragOverStageId(null); }}
                  className={`flex items-center gap-2 px-2 py-2 rounded-lg group transition ${
                    dragOverStageId === stage.id && dragStageId !== stage.id
                      ? "bg-blue-50 border border-blue-200"
                      : dragStageId === stage.id
                      ? "opacity-40 bg-gray-50"
                      : "bg-gray-50"
                  }`}
                >
                  {/* Drag handle */}
                  <div className="cursor-grab active:cursor-grabbing px-0.5">
                    <svg className="w-4 h-4 text-gray-300 hover:text-gray-500 transition" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                    </svg>
                  </div>
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: stage.color || "#6B7280" }}
                  />
                  {editingStageId === stage.id ? (
                    <input
                      value={editStageName}
                      onChange={(e) => setEditStageName(e.target.value)}
                      onBlur={() => handleUpdateStage(stage.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleUpdateStage(stage.id);
                        if (e.key === "Escape") setEditingStageId(null);
                      }}
                      className="flex-1 text-sm px-2 py-0.5 border border-[var(--border)] rounded bg-white"
                      autoFocus
                    />
                  ) : (
                    <span
                      className="flex-1 text-sm cursor-pointer hover:text-[var(--accent)] transition"
                      onClick={() => { setEditingStageId(stage.id); setEditStageName(stage.name); }}
                    >
                      {stage.name}
                    </span>
                  )}
                  <button
                    onClick={() => handleDeleteStage(stage.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-[var(--muted)] hover:text-red-500 rounded transition"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {/* Add new stage */}
            <div className="flex items-center gap-2">
              <input
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddStage(); }}
                placeholder="New stage name..."
                className="flex-1 px-3 py-2 text-sm border border-[var(--border)] rounded-lg"
              />
              <button
                onClick={handleAddStage}
                disabled={!newStageName.trim()}
                className="px-3 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
