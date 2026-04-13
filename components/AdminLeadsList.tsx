"use client";

import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import MetaLeadDetails, { hasAnyMetaAttribution, type MetaEventEntry } from "./MetaLeadDetails";

interface Lead {
  _id: string;
  _creationTime: number;
  company: string;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  contactPhone?: string;
  website: string;
  status: string;
  notes: string;
  source: string;
  // Meta attribution
  metaCampaignId?: string;
  metaAdSetId?: string;
  metaAdId?: string;
  metaFormId?: string;
  metaLeadgenId?: string;
  metaPageId?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  clientUserAgent?: string;
  clientIpAddress?: string;
  leadCapturedAt?: number;
  // Qualification
  qualification?: string;
  qualificationChangedAt?: number;
  statusChangedAt?: number;
  value?: number;
  currency?: string;
  statusHistory?: Array<{ status: string; at: number }>;
  metaEventsSent?: MetaEventEntry[];
}

// ────────────────────────────────────────────────────────────────────────────
// Status config
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

const QUALIFICATION_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  qualified:   { label: "Qualified",   bg: "bg-green-100",   text: "text-green-700",   dot: "#22c55e" },
  unqualified: { label: "Unqualified", bg: "bg-gray-200",    text: "text-gray-700",    dot: "#6b7280" },
  converted:   { label: "Converted",   bg: "bg-emerald-100", text: "text-emerald-700", dot: "#10b981" },
};

const QUALIFICATION_ORDER = ["qualified", "unqualified", "converted"];

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

function QualificationBadge({ qualification }: { qualification?: string }) {
  if (!qualification || !QUALIFICATION_CONFIG[qualification]) return <span className="text-xs text-[var(--muted)]">{"\u2014"}</span>;
  const c = QUALIFICATION_CONFIG[qualification];
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold rounded-full whitespace-nowrap ${c.bg} ${c.text} px-2 py-0.5 text-[10px]`}>
      <span className="inline-block rounded-full shrink-0" style={{ width: 5, height: 5, backgroundColor: c.dot }} />
      {c.label}
    </span>
  );
}

function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  const isMeta = source === "meta_ads";
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded ${
        isMeta ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"
      }`}
    >
      {isMeta && (
        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854V15.47H7.078V12h3.047V9.356c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.234 2.686.234v2.953H15.83c-1.491 0-1.956.925-1.956 1.874V12h3.328l-.532 3.47h-2.796v8.385C19.612 22.954 24 17.99 24 12z" />
        </svg>
      )}
      {source}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

export default function AdminLeadsList() {
  const leadsData = useQuery(api.leads.list);
  const leads: Lead[] = (leadsData ?? []) as Lead[];
  const loading = leadsData === undefined;
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterQualification, setFilterQualification] = useState<string>("all");

  const createLead = useMutation(api.leads.create);
  const updateLead = useMutation(api.leads.update);
  const removeLead = useMutation(api.leads.remove);
  const updateQualification = useMutation(api.leads.updateQualification);

  // Keep selectedLead in sync with real-time data
  useEffect(() => {
    if (selectedLead && leads.length > 0) {
      const updated = leads.find((l) => l._id === selectedLead._id);
      if (updated) setSelectedLead(updated);
    }
  }, [leads]);

  async function handleCreate(data: Partial<Lead>) {
    try {
      await createLead({
        company: data.company || "",
        contactName: data.contactName,
        contactRole: data.contactRole,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        website: data.website,
        status: data.status,
        notes: data.notes,
        source: data.source,
      });
      setShowAddPanel(false);
    } catch {}
  }

  async function handleUpdate(id: string, data: Partial<Lead>) {
    try {
      await updateLead({
        id: id as Id<"leads">,
        company: data.company,
        contactName: data.contactName,
        contactRole: data.contactRole,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        website: data.website,
        status: data.status,
        notes: data.notes,
        source: data.source,
        value: data.value,
        currency: data.currency,
      });
    } catch {}
  }

  async function handleQualificationChange(
    id: string,
    qualification: "qualified" | "unqualified" | "converted" | "unset",
    extras?: { value?: number; currency?: string }
  ) {
    try {
      await updateQualification({
        id: id as Id<"leads">,
        qualification,
        value: extras?.value,
        currency: extras?.currency,
      });
    } catch {}
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this lead?")) return;
    try {
      await removeLead({ id: id as Id<"leads"> });
      setSelectedLead(null);
    } catch {}
  }

  const filteredLeads = leads.filter((l) => {
    if (filterStatus !== "all" && l.status !== filterStatus) return false;
    if (filterQualification !== "all") {
      if (filterQualification === "unset") {
        if (l.qualification) return false;
      } else if (l.qualification !== filterQualification) {
        return false;
      }
    }
    return true;
  });

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
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[11px] font-medium text-[var(--muted)] uppercase tracking-wide mr-1">Pipeline</span>
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

      {/* Qualification filter pills */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-[11px] font-medium text-[var(--muted)] uppercase tracking-wide mr-1">Quality</span>
        <button
          onClick={() => setFilterQualification("all")}
          className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
            filterQualification === "all"
              ? "bg-[var(--foreground)] text-white"
              : "bg-gray-100 text-[var(--muted)] hover:bg-gray-200"
          }`}
        >
          All
        </button>
        {QUALIFICATION_ORDER.map((value) => {
          const count = leads.filter((l) => l.qualification === value).length;
          const config = QUALIFICATION_CONFIG[value];
          return (
            <button
              key={value}
              onClick={() => setFilterQualification(value)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                filterQualification === value
                  ? "bg-[var(--foreground)] text-white"
                  : "bg-gray-100 text-[var(--muted)] hover:bg-gray-200"
              }`}
            >
              {config.label} ({count})
            </button>
          );
        })}
        {(() => {
          const count = leads.filter((l) => !l.qualification).length;
          return (
            <button
              onClick={() => setFilterQualification("unset")}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                filterQualification === "unset"
                  ? "bg-[var(--foreground)] text-white"
                  : "bg-gray-100 text-[var(--muted)] hover:bg-gray-200"
              }`}
            >
              Unreviewed ({count})
            </button>
          );
        })()}
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
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Source</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Status</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Quality</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Added</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted)]">
                    {filterStatus === "all" && filterQualification === "all"
                      ? 'No leads yet. Click "+ Add Lead" to get started.'
                      : "No leads match these filters."}
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
                    <td className="px-4 py-3">
                      <SourceBadge source={lead.source} />
                    </td>
                    <td className="px-4 py-3">
                      <LeadStatusBadge status={lead.status} />
                    </td>
                    <td className="px-4 py-3">
                      <QualificationBadge qualification={lead.qualification} />
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
          onQualificationChange={(q, extras) => {
            if (selectedLead) handleQualificationChange(selectedLead._id, q, extras);
          }}
          onDelete={selectedLead ? () => handleDelete(selectedLead._id) : undefined}
          onClose={() => { setSelectedLead(null); setShowAddPanel(false); }}
        />
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Slide-in panel
// ────────────────────────────────────────────────────────────────────────────

function LeadSlidePanel({
  lead,
  onSave,
  onQualificationChange,
  onDelete,
  onClose,
}: {
  lead: Lead | null;
  onSave: (data: Partial<Lead>) => void;
  onQualificationChange?: (q: "qualified" | "unqualified" | "converted" | "unset", extras?: { value?: number; currency?: string }) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [company, setCompany] = useState(lead?.company ?? "");
  const [contactName, setContactName] = useState(lead?.contactName ?? "");
  const [contactRole, setContactRole] = useState(lead?.contactRole ?? "");
  const [contactEmail, setContactEmail] = useState(lead?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(lead?.contactPhone ?? "");
  const [website, setWebsite] = useState(lead?.website ?? "");
  const [status, setStatus] = useState(lead?.status ?? "new");
  const [notes, setNotes] = useState(lead?.notes ?? "");
  const [source, setSource] = useState(lead?.source ?? "");
  const [value, setValue] = useState<string>(lead?.value != null ? String(lead.value) : "");
  const [currency, setCurrency] = useState(lead?.currency ?? "USD");
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Sync form when lead changes (e.g. after update)
  useEffect(() => {
    setCompany(lead?.company ?? "");
    setContactName(lead?.contactName ?? "");
    setContactRole(lead?.contactRole ?? "");
    setContactEmail(lead?.contactEmail ?? "");
    setContactPhone(lead?.contactPhone ?? "");
    setWebsite(lead?.website ?? "");
    setStatus(lead?.status ?? "new");
    setNotes(lead?.notes ?? "");
    setSource(lead?.source ?? "");
    setValue(lead?.value != null ? String(lead.value) : "");
    setCurrency(lead?.currency ?? "USD");
  }, [lead]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

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

  const isMetaLead = lead ? hasAnyMetaAttribution(lead) : false;
  const parsedValue = value.trim() === "" ? undefined : Number(value);

  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[100] flex justify-end" onClick={handleClose}>
      <div
        className={`absolute inset-0 transition-opacity duration-200 ${
          visible ? "bg-black/30" : "bg-black/0"
        }`}
      />

      <div
        ref={panelRef}
        className={`relative w-full max-w-[50%] max-md:max-w-full h-full bg-white shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {lead ? (
              <>
                <LeadStatusBadge status={lead.status} />
                <QualificationBadge qualification={lead.qualification} />
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

            {/* Pipeline Status */}
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Pipeline Status</label>
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
              {lead?.statusChangedAt && (
                <div className="text-[11px] text-[var(--muted)] mt-1.5">
                  Last changed{" "}
                  {new Date(lead.statusChangedAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              )}
            </div>

            {/* Qualification / Ads Optimization — only for existing leads */}
            {lead && (
              <div className="rounded-lg border border-[var(--border)] bg-gray-50/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-[var(--foreground)]">
                    Lead Quality (for Ads Optimization)
                  </label>
                  {lead.qualificationChangedAt && (
                    <span className="text-[10px] text-[var(--muted)]">
                      Updated{" "}
                      {new Date(lead.qualificationChangedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--muted)] mb-2">
                  Setting this triggers a Meta Conversions API event so ads optimize for real quality — not just form fills.
                </p>
                <div className="flex flex-wrap gap-2">
                  {(["qualified", "unqualified", "converted"] as const).map((q) => {
                    const c = QUALIFICATION_CONFIG[q];
                    const isSelected = lead.qualification === q;
                    return (
                      <button
                        key={q}
                        onClick={() => {
                          if (isSelected) {
                            onQualificationChange?.("unset");
                          } else if (q === "converted") {
                            onQualificationChange?.(q, {
                              value: parsedValue,
                              currency: currency || "USD",
                            });
                          } else {
                            onQualificationChange?.(q);
                          }
                        }}
                        className={`inline-flex items-center gap-1.5 font-semibold rounded-full px-2.5 py-1 text-xs transition ${
                          isSelected
                            ? `${c.bg} ${c.text} ring-2 ring-offset-1`
                            : "bg-white text-[var(--muted)] border border-[var(--border)] hover:bg-gray-100"
                        }`}
                        style={isSelected ? ({ ringColor: c.dot } as any) : undefined}
                      >
                        <span
                          className="inline-block rounded-full shrink-0"
                          style={{ width: 6, height: 6, backgroundColor: isSelected ? c.dot : "#9ca3af" }}
                        />
                        {c.label}
                      </button>
                    );
                  })}
                  {lead.qualification && (
                    <button
                      onClick={() => onQualificationChange?.("unset")}
                      className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] px-2 py-1"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Deal value — only relevant when Converted */}
                {(lead.qualification === "converted" || lead.qualification === undefined) && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-medium text-[var(--muted)] mb-1 uppercase tracking-wide">
                        Deal Value (for Purchase event)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onBlur={() => {
                          // Persist value to lead on blur
                          onSave({ value: parsedValue, currency });
                        }}
                        className="w-full px-2 py-1.5 text-xs border border-[var(--border)] rounded focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-[var(--muted)] mb-1 uppercase tracking-wide">
                        Currency
                      </label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        onBlur={() => onSave({ value: parsedValue, currency })}
                        className="w-full px-2 py-1.5 text-xs border border-[var(--border)] rounded focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      >
                        <option value="USD">USD</option>
                        <option value="CAD">CAD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

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

            <div className="grid grid-cols-2 gap-4">
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
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  placeholder="+1 555 123 4567"
                />
              </div>
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
                placeholder="referral, linkedin, meta_ads, website, etc."
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

            {/* Meta attribution — only shown when any Meta field is present */}
            {lead && isMetaLead && (
              <MetaLeadDetails
                attribution={{
                  source: lead.source,
                  metaCampaignId: lead.metaCampaignId,
                  metaAdSetId: lead.metaAdSetId,
                  metaAdId: lead.metaAdId,
                  metaFormId: lead.metaFormId,
                  metaLeadgenId: lead.metaLeadgenId,
                  metaPageId: lead.metaPageId,
                  fbclid: lead.fbclid,
                  fbc: lead.fbc,
                  fbp: lead.fbp,
                  clientUserAgent: lead.clientUserAgent,
                  clientIpAddress: lead.clientIpAddress,
                  leadCapturedAt: lead.leadCapturedAt,
                }}
                events={lead.metaEventsSent}
              />
            )}

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
                onSave({
                  company,
                  contactName,
                  contactRole,
                  contactEmail,
                  contactPhone,
                  website,
                  status,
                  notes,
                  source,
                  value: parsedValue,
                  currency,
                });
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
