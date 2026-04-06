"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Project, ProjectTemplateRole, TeamMember } from "@/types";
import DatePicker from "./DatePicker";
import { useRouter } from "next/navigation";
import { useClients } from "@/hooks/useClients";
import { useTeamMembers } from "@/hooks/useTeamMembers";

interface ProjectCreateFlowProps {
  onClose: () => void;
  onCreated: () => void;
}

type Step = "choose" | "blank" | "template-select" | "template-setup" | "role-mapping";

export default function ProjectCreateFlow({ onClose, onCreated }: ProjectCreateFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");

  // Blank project form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);

  // Template flow
  const [selectedTemplate, setSelectedTemplate] = useState<Project | null>(null);
  const [templateRoles, setTemplateRoles] = useState<ProjectTemplateRole[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<Record<string, string>>({});

  // Shared — from hooks
  const { clients } = useClients();
  const { teamMembers } = useTeamMembers();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Quick add client
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientWebsite, setNewClientWebsite] = useState("");
  const [newClientContact, setNewClientContact] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [savingClient, setSavingClient] = useState(false);

  // Templates from Convex
  const templateDocs = useQuery(api.projects.list, { isTemplate: true });
  const templates: Project[] = useMemo(() => {
    if (!templateDocs) return [];
    return templateDocs.map((doc: any) => ({
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
      ticketCount: doc.ticketCount ?? undefined,
      completedTicketCount: doc.completedTicketCount ?? undefined,
    })) as Project[];
  }, [templateDocs]);

  // Mutations
  const createProject = useMutation(api.projects.create);
  const createClient = useMutation(api.clients.create);

  // Fetch roles when a template is selected (still via API — no Convex query for roles yet)
  useEffect(() => {
    if (selectedTemplate) {
      fetch(`/api/admin/projects/${selectedTemplate.id}/roles`)
        .then((r) => r.json())
        .then(setTemplateRoles)
        .catch(() => setTemplateRoles([]));
    }
  }, [selectedTemplate]);

  async function handleCreateBlank() {
    if (!name.trim()) return;
    setSaving(true);
    setError("");

    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim(),
        clientId: clientId ? (clientId as Id<"clients">) : undefined,
        startDate: startDate ?? undefined,
        dueDate: dueDate ?? undefined,
      });
      if (project) {
        onCreated();
        router.push(`/admin/projects/${project._id}`);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to create project");
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    if (!selectedTemplate || !name.trim() || !clientId || !startDate) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/projects/${selectedTemplate.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          clientId,
          startDate,
          roleAssignments: Object.keys(roleAssignments).length > 0 ? roleAssignments : undefined,
        }),
      });

      if (res.ok) {
        const project = await res.json();
        onCreated();
        router.push(`/admin/projects/${project.id}`);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to create project");
      }
    } catch {
      setError("Failed to create project");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddClient() {
    if (!newClientName.trim()) return;
    setSavingClient(true);
    try {
      const created = await createClient({
        name: newClientName.trim(),
        websiteUrl: newClientWebsite.trim() || undefined,
        contactName: newClientContact.trim() || undefined,
        contactEmail: newClientEmail.trim() || undefined,
        active: true,
      });
      // Auto-select the new client (useClients hook will auto-update the list)
      if (created) setClientId(created._id as string);
      // Reset and close
      setShowAddClient(false);
      setNewClientName("");
      setNewClientWebsite("");
      setNewClientContact("");
      setNewClientEmail("");
    } catch {} finally {
      setSavingClient(false);
    }
  }

  function selectTemplate(t: Project) {
    setSelectedTemplate(t);
    setName(`${t.name} - `);
    setStep("template-setup");
  }

  function proceedToRoles() {
    if (!name.trim() || !clientId || !startDate) {
      setError("Please fill in all required fields");
      return;
    }
    setError("");
    if (templateRoles.length > 0) {
      setStep("role-mapping");
    } else {
      handleDuplicate();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            {step !== "choose" && (
              <button
                onClick={() => {
                  if (step === "role-mapping") setStep("template-setup");
                  else if (step === "template-setup") setStep("template-select");
                  else if (step === "template-select" || step === "blank") setStep("choose");
                }}
                className="p-1 hover:bg-gray-100 rounded transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h2 className="text-lg font-bold">
              {step === "choose" && "New Project"}
              {step === "blank" && "Create Blank Project"}
              {step === "template-select" && "Choose Template"}
              {step === "template-setup" && "Project Details"}
              {step === "role-mapping" && "Assign Roles"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step: Choose */}
        {step === "choose" && (
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setStep("blank")}
              className="p-6 border-2 border-[var(--border)] rounded-xl hover:border-[var(--accent)] hover:bg-blue-50/30 transition text-left group"
            >
              <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center mb-3 transition">
                <svg className="w-5 h-5 text-gray-500 group-hover:text-[var(--accent)] transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h3 className="font-semibold text-sm mb-1">Blank Project</h3>
              <p className="text-xs text-[var(--muted)]">Start from scratch with an empty project</p>
            </button>
            <button
              onClick={() => setStep("template-select")}
              className="p-6 border-2 border-[var(--border)] rounded-xl hover:border-[var(--accent)] hover:bg-blue-50/30 transition text-left group"
            >
              <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center mb-3 transition">
                <svg className="w-5 h-5 text-gray-500 group-hover:text-[var(--accent)] transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="font-semibold text-sm mb-1">From Template</h3>
              <p className="text-xs text-[var(--muted)]">Use a template with pre-built tickets and groups</p>
            </button>
          </div>
        )}

        {/* Step: Blank Project */}
        {step === "blank" && (
          <div className="space-y-5">
            <div>
              <label className="text-xs font-medium text-[var(--muted)] mb-1.5 block">Project Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Acme Website Redesign"
                className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--muted)] mb-1.5 block">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--muted)] mb-1.5 block">Client</label>
              <select
                value={clientId ?? ""}
                onChange={(e) => setClientId(e.target.value || null)}
                className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-white"
              >
                <option value="">No client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowAddClient(true)}
                className="text-xs text-[var(--accent)] hover:underline mt-1.5"
              >
                + Add new client
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-[var(--muted)] mb-1.5 block">Start Date</label>
                <DatePicker
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="Today"
                  displayFormat="full"
                  className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg block"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--muted)] mb-1.5 block">Due Date</label>
                <DatePicker
                  value={dueDate}
                  onChange={setDueDate}
                  placeholder="Select"
                  displayFormat="full"
                  className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg block"
                />
              </div>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBlank}
                disabled={saving || !name.trim()}
                className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                {saving ? "Setting up project..." : "Create Project"}
              </button>
            </div>
          </div>
        )}

        {/* Step: Template Select */}
        {step === "template-select" && (
          <div className="space-y-3">
            {templates.length === 0 ? (
              <div className="text-center py-8 text-[var(--muted)] text-sm">
                No templates available. Create a template first.
              </div>
            ) : (
              templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectTemplate(t)}
                  className="w-full p-4 border border-[var(--border)] rounded-xl hover:border-[var(--accent)] hover:bg-blue-50/20 transition text-left"
                >
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-sm">{t.name}</h3>
                    <span className="px-2 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 rounded-full">
                      {t.ticketCount || 0} tickets
                    </span>
                  </div>
                  {t.description && (
                    <p className="text-xs text-[var(--muted)] line-clamp-2">{t.description}</p>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {/* Step: Template Setup (name, client, start date) */}
        {step === "template-setup" && selectedTemplate && (
          <div className="space-y-5">
            <div className="px-3 py-2 bg-purple-50 rounded-lg">
              <p className="text-xs text-purple-700">
                Using template: <span className="font-semibold">{selectedTemplate.name}</span>
                {" "}({selectedTemplate.ticketCount || 0} tickets)
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-[var(--muted)] mb-1.5 block">Project Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--muted)] mb-1.5 block">Client *</label>
              <select
                value={clientId ?? ""}
                onChange={(e) => setClientId(e.target.value || null)}
                className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-white"
              >
                <option value="">Select a client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowAddClient(true)}
                className="text-xs text-[var(--accent)] hover:underline mt-1.5"
              >
                + Add new client
              </button>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--muted)] mb-1.5 block">Start Date *</label>
              <DatePicker
                value={startDate}
                onChange={setStartDate}
                placeholder="Today"
                displayFormat="full"
                className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg block"
              />
              <p className="text-[10px] text-[var(--muted)] mt-1.5">
                All ticket dates will be scheduled relative to this date. Weekends are automatically adjusted to Monday.
              </p>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition"
              >
                Cancel
              </button>
              <button
                onClick={proceedToRoles}
                disabled={saving || !name.trim() || !clientId || !startDate}
                className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                {templateRoles.length > 0
                  ? "Next: Assign Roles"
                  : saving
                  ? "Creating..."
                  : "Create Project"}
              </button>
            </div>
          </div>
        )}

        {/* Step: Role Mapping */}
        {step === "role-mapping" && selectedTemplate && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              Assign a team member to each role. All tickets with that role will be auto-assigned.
            </p>

            <div className="space-y-3">
              {templateRoles.map((role) => (
                <div key={role.id} className="flex items-center gap-3">
                  <label className="text-sm font-medium w-40 shrink-0 truncate">
                    {role.name}
                  </label>
                  <select
                    value={roleAssignments[role.id] ?? ""}
                    onChange={(e) => {
                      const val = e.target.value || undefined;
                      setRoleAssignments((prev) => {
                        const next = { ...prev };
                        if (val) {
                          next[role.id] = val;
                        } else {
                          delete next[role.id];
                        }
                        return next;
                      });
                    }}
                    className="flex-1 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-white"
                  >
                    <option value="">Unassigned</option>
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setStep("template-setup")}
                className="px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition"
              >
                Back
              </button>
              <button
                onClick={handleDuplicate}
                disabled={saving}
                className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                {saving ? "Setting up project..." : "Create Project"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Add Client Modal */}
      {showAddClient && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddClient(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="text-base font-bold mb-3">Add New Client</h3>
            <div className="space-y-2.5">
              <div>
                <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Business Name *</label>
                <input
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="e.g., Acme Corp"
                  className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Website</label>
                <input
                  value={newClientWebsite}
                  onChange={(e) => setNewClientWebsite(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Contact Name</label>
                <input
                  value={newClientContact}
                  onChange={(e) => setNewClientContact(e.target.value)}
                  placeholder="John Smith"
                  className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--muted)] mb-1 block">Contact Email</label>
                <input
                  value={newClientEmail}
                  onChange={(e) => setNewClientEmail(e.target.value)}
                  placeholder="john@acme.com"
                  type="email"
                  className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowAddClient(false)}
                className="px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddClient}
                disabled={savingClient || !newClientName.trim()}
                className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                {savingClient ? "Adding..." : "Add Client"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
