"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";

interface Lead {
  _id: string;
  _creationTime: number;
  company: string;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  website: string;
  status: string;
  notes: string;
  source: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Status config — matches TicketStatusBadge pattern (dot + pill)
// ────────────────────────────────────────────────────────────────────────────

const LEAD_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  new:                { label: "New",                bg: "bg-blue-100",    text: "text-blue-700",    dot: "#3b82f6" },
  contacted:          { label: "Contacted",          bg: "bg-yellow-100",  text: "text-yellow-700",  dot: "#eab308" },
  responded:          { label: "Responded",          bg: "bg-green-100",   text: "text-green-700",   dot: "#22c55e" },
  meeting_scheduled:  { label: "Meeting Scheduled",  bg: "bg-purple-100",  text: "text-purple-700",  dot: "#a855f7" },
  proposal_sent:      { label: "Proposal Sent",      bg: "bg-orange-100",  text: "text-orange-700",  dot: "#f97316" },
  won:                { label: "Won",                bg: "bg-emerald-100", text: "text-emerald-700", dot: "#10b981" },
  lost:               { label: "Lost",               bg: "bg-red-100",     text: "text-red-700",     dot: "#ef4444" },
};

const LEAD_STATUS_ORDER = ["new", "contacted", "responded", "meeting_scheduled", "proposal_sent", "won", "lost"];

function LeadStatusBadge({ status, size = "sm" }: { status: string; size?: "xs" | "sm" }) {
  const config = LEAD_STATUS_CONFIG[status] ?? LEAD_STATUS_CONFIG.new;
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full whitespace-nowrap ${config.bg} ${config.text} ${
        size === "xs" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      }`}
    >
      <span
        className="inline-block rounded-full shrink-0"
        style={{ width: 6, height: 6, backgroundColor: config.dot }}
      />
      {config.label}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

export default function AdminLeadsList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/leads");
      if (res.ok) {
        setLeads(await res.json());
      }
    } catch {
      // Failed to fetch
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  async function handleCreate(data: Partial<Lead>) {
    try {
      const res = await fetch("/api/admin/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setShowAddPanel(false);
        fetchLeads();
      }
    } catch {}
  }

  async function handleUpdate(id: string, data: Partial<Lead>) {
    try {
      const res = await fetch("/api/admin/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      if (res.ok) {
        // Refresh the selected lead in-place
        const updated = await res.json();
        setSelectedLead(updated);
        fetchLeads();
      }
    } catch {}
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this lead?")) return;
    try {
      const res = await fetch(`/api/admin/leads?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setSelectedLead(null);
        fetchLeads();
      }
    } catch {}
  }

  const filteredLeads = filterStatus === "all"
    ? leads
    : leads.filter((l) => l.status === filterStatus);

  const panelOpen = selectedLead !== null || showAddPanel;

  if (loading) {
    return <div className="text-center py-12 text-[var(--muted)] text-sm">Loading...</div>;
  }

  return (
    <>
      {/* Page heading */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[var(--foreground)]">Leads</h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            Track and manage prospective clients
          </p>
        </div>
        <button
          onClick={() => { setShowAddPanel(true); setSelectedLead(null); }}
          className="px-4 py-2 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition"
        >
          + Add Lead
        </button>
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setFilterStatus("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
            filterStatus === "all"
              ? "bg-[var(--foreground)] text-white"
              : "bg-gray-100 text-[var(--muted)] hover:bg-gray-200"
          }`}
        >
          All ({leads.length})
        </button>
        {LEAD_STATUS_ORDER.map((value) => {
          const count = leads.filter((l) => l.status === value).length;
          if (count === 0) return null;
          const config = LEAD_STATUS_CONFIG[value];
          return (
            <button
              key={value}
              onClick={() => setFilterStatus(value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                filterStatus === value
                  ? "bg-[var(--foreground)] text-white"
                  : "bg-gray-100 text-[var(--muted)] hover:bg-gray-200"
              }`}
            >
              {config.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--accent-light)] border-b border-[var(--border)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Company</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Contact</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Email</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Website</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Status</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Added</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--muted)]">
                    {filterStatus === "all"
                      ? 'No leads yet. Click "+ Add Lead" to get started.'
                      : "No leads with this status."}
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr
                    key={lead._id}
                    onClick={() => { setSelectedLead(lead); setShowAddPanel(false); }}
                    className={`border-b border-[var(--border)] hover:bg-[var(--accent-light)] cursor-pointer transition ${
                      selectedLead?._id === lead._id ? "bg-[var(--accent-light)]" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                      {lead.company}
                    </td>
                    <td className="px-4 py-3 text-[var(--foreground)]">
                      <div>
                        <span>{lead.contactName || "\u2014"}</span>
                        {lead.contactRole && (
                          <span className="text-xs text-[var(--muted)] ml-1">({lead.contactRole})</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)] text-xs group/email">
                      <div className="flex items-center gap-1">
                        <span>{lead.contactEmail || "\u2014"}</span>
                        {lead.contactEmail && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(lead.contactEmail);
                              setCopiedEmail(lead._id);
                              setTimeout(() => setCopiedEmail(null), 1500);
                            }}
                            className={`shrink-0 p-0.5 rounded transition ${
                              copiedEmail === lead._id
                                ? "text-[var(--success-text)] opacity-100"
                                : "text-[var(--muted)] opacity-0 group-hover/email:opacity-100 hover:text-[var(--foreground)]"
                            }`}
                            title="Copy email"
                          >
                            {copiedEmail === lead._id ? (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {lead.website ? (
                        <a
                          href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[var(--accent)] hover:underline"
                        >
                          {lead.website.replace(/^https?:\/\/(www\.)?/, "")}
                        </a>
                      ) : (
                        <span className="text-[var(--muted)]">{"\u2014"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <LeadStatusBadge status={lead.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--muted)]">
                      {new Date(lead._creationTime).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-in panel */}
      {panelOpen && (
        <LeadSlidePanel
          lead={selectedLead}
          onSave={(data) => {
            if (selectedLead) {
              handleUpdate(selectedLead._id, data);
            } else {
              handleCreate(data);
            }
          }}
          onDelete={selectedLead ? () => handleDelete(selectedLead._id) : undefined}
          onClose={() => { setSelectedLead(null); setShowAddPanel(false); }}
        />
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Slide-in panel (right side, half page)
// ────────────────────────────────────────────────────────────────────────────

function LeadSlidePanel({
  lead,
  onSave,
  onDelete,
  onClose,
}: {
  lead: Lead | null;
  onSave: (data: Partial<Lead>) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [company, setCompany] = useState(lead?.company ?? "");
  const [contactName, setContactName] = useState(lead?.contactName ?? "");
  const [contactRole, setContactRole] = useState(lead?.contactRole ?? "");
  const [contactEmail, setContactEmail] = useState(lead?.contactEmail ?? "");
  const [website, setWebsite] = useState(lead?.website ?? "");
  const [status, setStatus] = useState(lead?.status ?? "new");
  const [notes, setNotes] = useState(lead?.notes ?? "");
  const [source, setSource] = useState(lead?.source ?? "");
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Sync form when lead changes (e.g. after update)
  useEffect(() => {
    setCompany(lead?.company ?? "");
    setContactName(lead?.contactName ?? "");
    setContactRole(lead?.contactRole ?? "");
    setContactEmail(lead?.contactEmail ?? "");
    setWebsite(lead?.website ?? "");
    setStatus(lead?.status ?? "new");
    setNotes(lead?.notes ?? "");
    setSource(lead?.source ?? "");
  }, [lead]);

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Escape to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  const config = LEAD_STATUS_CONFIG[lead?.status ?? "new"] ?? LEAD_STATUS_CONFIG.new;

  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[100] flex justify-end" onClick={handleClose}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 transition-opacity duration-200 ${
          visible ? "bg-black/30" : "bg-black/0"
        }`}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`relative w-full max-w-[50%] max-md:max-w-full h-full bg-white shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {lead ? (
              <>
                <LeadStatusBadge status={lead.status} />
                <span className="text-sm font-semibold text-[var(--foreground)] truncate">
                  {lead.company}
                </span>
              </>
            ) : (
              <span className="text-sm font-semibold text-[var(--foreground)]">New Lead</span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-gray-200/60 text-[var(--muted)] hover:text-[var(--foreground)] transition shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            {/* Company */}
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Company *</label>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                placeholder="Company name"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Status</label>
              <div className="flex flex-wrap gap-2">
                {LEAD_STATUS_ORDER.map((value) => {
                  const c = LEAD_STATUS_CONFIG[value];
                  const isSelected = status === value;
                  return (
                    <button
                      key={value}
                      onClick={() => setStatus(value)}
                      className={`inline-flex items-center gap-1.5 font-semibold rounded-full px-2.5 py-1 text-xs transition ${
                        isSelected
                          ? `${c.bg} ${c.text} ring-2 ring-offset-1`
                          : "bg-gray-100 text-[var(--muted)] hover:bg-gray-200"
                      }`}
                      style={isSelected ? { ringColor: c.dot } as any : undefined}
                    >
                      <span
                        className="inline-block rounded-full shrink-0"
                        style={{ width: 6, height: 6, backgroundColor: isSelected ? c.dot : "#9ca3af" }}
                      />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-[var(--border)]" />

            {/* Contact info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Contact Name</label>
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  placeholder="First Last"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Role / Title</label>
                <input
                  value={contactRole}
                  onChange={(e) => setContactRole(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  placeholder="CEO, Marketing Director, etc."
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Email</label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                placeholder="email@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Website</label>
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                placeholder="https://example.com"
              />
            </div>

            <div className="border-t border-[var(--border)]" />

            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Source</label>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                placeholder="Cold outreach, referral, etc."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
                placeholder="Any additional context about this lead..."
              />
            </div>

            {/* Meta info for existing leads */}
            {lead && (
              <div className="text-xs text-[var(--muted)] pt-2">
                Added {new Date(lead._creationTime).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)] bg-gray-50/50 shrink-0">
          <div>
            {onDelete && (
              <button
                onClick={onDelete}
                className="text-sm text-red-500 hover:text-red-700 transition"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!company.trim()) return;
                onSave({ company, contactName, contactRole, contactEmail, website, status, notes, source });
              }}
              disabled={!company.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {lead ? "Save Changes" : "Add Lead"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
