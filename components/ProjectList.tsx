"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Project } from "@/types";
import { friendlyDate } from "@/lib/date-format";
import { useClients } from "@/hooks/useClients";
import ProjectCreateFlow from "./ProjectCreateFlow";
import { Id } from "@/convex/_generated/dataModel";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  on_hold: "bg-yellow-100 text-yellow-700",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  completed: "Completed",
  on_hold: "On Hold",
};

export default function ProjectList() {
  const { clients, isLoading: clientsLoading } = useClients();
  const [filterClient, setFilterClient] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [templatesCollapsed, setTemplatesCollapsed] = useState(false);
  const [showCreateFlow, setShowCreateFlow] = useState(false);
  const [showTemplateCreateModal, setShowTemplateCreateModal] = useState(false);

  // Template create form state
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Convex query for projects — pass filters as args
  const queryArgs = useMemo(() => {
    const args: Record<string, unknown> = {};
    if (filterClient) args.clientId = filterClient as Id<"clients">;
    if (showArchived) args.archived = true;
    return args;
  }, [filterClient, showArchived]);
  const projectDocs = useQuery(api.projects.list, queryArgs);
  const loading = projectDocs === undefined;

  // Map docs to Project type and apply client-side search filter
  const projects: Project[] = useMemo(() => {
    if (!projectDocs) return [];
    const mapped = projectDocs.map((doc: any) => ({
      id: doc._id,
      name: doc.name ?? "",
      description: doc.description ?? "",
      clientId: doc.clientId ?? null,
      isTemplate: doc.isTemplate ?? false,
      status: doc.status ?? "active",
      archived: doc.archived ?? false,
      startDate: doc.startDate ?? null,
      dueDate: doc.dueDate ?? null,
      createdById: doc.createdById ?? null,
      createdAt: doc._creationTime ? new Date(doc._creationTime).toISOString() : "",
      updatedAt: "",
      clientName: doc.clientName ?? undefined,
      ticketCount: doc.ticketCount ?? undefined,
      completedTicketCount: doc.completedTicketCount ?? undefined,
    })) as Project[];
    if (!search) return mapped;
    const q = search.toLowerCase();
    return mapped.filter((p) => p.name.toLowerCase().includes(q));
  }, [projectDocs, search]);

  const templates = projects.filter((p) => p.isTemplate);
  const activeProjects = projects.filter((p) => !p.isTemplate);

  const createProject = useMutation(api.projects.create);

  async function handleCreateTemplate() {
    if (!newTemplateName.trim()) return;
    setSavingTemplate(true);
    try {
      await createProject({
        name: newTemplateName.trim(),
        description: newTemplateDesc.trim(),
        isTemplate: true,
      });
      setShowTemplateCreateModal(false);
      setNewTemplateName("");
      setNewTemplateDesc("");
    } catch {} finally {
      setSavingTemplate(false);
    }
  }

  function getProgress(p: Project): number {
    if (!p.ticketCount || p.ticketCount === 0) return 0;
    return Math.round(((p.completedTicketCount || 0) / p.ticketCount) * 100);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--foreground)]">Projects</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTemplateCreateModal(true)}
            className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg hover:bg-gray-50 transition"
          >
            + Template
          </button>
          <button
            onClick={() => setShowCreateFlow(true)}
            className="px-3 py-1.5 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition"
          >
            + New Project
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects..."
          className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg w-48 bg-white"
        />
        <select
          value={filterClient ?? ""}
          onChange={(e) => setFilterClient(e.target.value || null)}
          className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-white"
        >
          <option value="">All Clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-[var(--muted)] cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded"
          />
          Show archived
        </label>
      </div>

      {/* Templates Section */}
      {templates.length > 0 && (
        <div>
          <button
            onClick={() => setTemplatesCollapsed(!templatesCollapsed)}
            className="flex items-center gap-2 mb-3 text-sm font-semibold text-[var(--muted)] uppercase tracking-wider hover:text-[var(--foreground)] transition"
          >
            <svg
              className={`w-3 h-3 transition-transform ${templatesCollapsed ? "" : "rotate-90"}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
            Templates ({templates.length})
          </button>
          {!templatesCollapsed && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  progress={getProgress(p)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Projects */}
      <div>
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
          Active Projects ({activeProjects.length})
        </h2>
        {activeProjects.length === 0 ? (
          <div className="text-center py-12 text-[var(--muted)] text-sm">
            No projects yet. Create one or duplicate a template to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeProjects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                progress={getProgress(p)}
              />
            ))}
          </div>
        )}
      </div>

      {/* New Project Flow (blank or from template) */}
      {showCreateFlow && (
        <ProjectCreateFlow
          onClose={() => setShowCreateFlow(false)}
          onCreated={() => {
            setShowCreateFlow(false);
          }}
        />
      )}

      {/* Create Template Modal */}
      {showTemplateCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowTemplateCreateModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">New Template</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Template Name *</label>
                <input
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g., Website Onboarding"
                  className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Description</label>
                <textarea
                  value={newTemplateDesc}
                  onChange={(e) => setNewTemplateDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowTemplateCreateModal(false)}
                className="px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTemplate}
                disabled={savingTemplate || !newTemplateName.trim()}
                className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                {savingTemplate ? "Creating..." : "Create Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// === Project Card ===

function ProjectCard({
  project,
  progress,
  onDuplicate,
}: {
  project: Project;
  progress: number;
  onDuplicate?: () => void;
}) {
  return (
    <a
      href={`/admin/projects/${project.id}`}
      className="block bg-white border border-[var(--border)] rounded-xl p-4 hover:shadow-md transition group"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-[var(--foreground)] truncate group-hover:text-[var(--accent)] transition">
            {project.name}
          </h3>
          {project.clientName && (
            <p className="text-xs text-[var(--muted)] mt-0.5">{project.clientName}</p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-2">
          {project.isTemplate && (
            <span className="px-2 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 rounded-full">
              Template
            </span>
          )}
          <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${STATUS_COLORS[project.status] || STATUS_COLORS.active}`}>
            {STATUS_LABELS[project.status] || project.status}
          </span>
        </div>
      </div>

      {project.description && (
        <p className="text-xs text-[var(--muted)] line-clamp-2 mb-3">{project.description}</p>
      )}

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-[10px] text-[var(--muted)] mb-1">
          <span>{project.completedTicketCount || 0} / {project.ticketCount || 0} tickets</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Dates */}
      <div className="flex items-center justify-between text-[10px] text-[var(--muted)]">
        <span>
          {project.startDate && (
            <>Start: {friendlyDate(project.startDate)}</>
          )}
        </span>
        <span>
          {project.dueDate && (
            <>Due: {friendlyDate(project.dueDate)}</>
          )}
        </span>
      </div>

      {/* Template actions */}
      {project.isTemplate && onDuplicate && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDuplicate();
          }}
          className="mt-3 w-full px-3 py-1.5 text-xs font-medium text-[var(--accent)] border border-[var(--accent)] rounded-lg hover:bg-[var(--accent)] hover:text-white transition"
        >
          Use Template
        </button>
      )}
    </a>
  );
}
