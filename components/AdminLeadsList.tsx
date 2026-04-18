"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactDOM from "react-dom";
import FilterDropdown from "./FilterDropdown";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import MetaLeadDetails, { hasAnyMetaAttribution, type MetaEventEntry } from "./MetaLeadDetails";
import LeadActivityLog from "./LeadActivityLog";

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
  unqualified: { label: "Unqualified", bg: "bg-[#E8E1CF]",  text: "text-[var(--foreground)]", dot: "#9B8F76" },
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

const SOURCE_PASTELS = [
  "#B1D0FF",
  "#A69FFF",
  "#FFA69E",
  "#FBBDFF",
  "#BDFFE8",
  "#ACFF9E",
  "#FFF09E",
];
function pastelFor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return SOURCE_PASTELS[h % SOURCE_PASTELS.length];
}
function humanSource(source: string) {
  return source
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  const isMeta = source === "meta_ads";
  const bg = isMeta ? "#B1D0FF" : pastelFor(source);
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full whitespace-nowrap text-[var(--foreground)]"
      style={{ backgroundColor: bg }}
    >
      {isMeta && (
        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854V15.47H7.078V12h3.047V9.356c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.234 2.686.234v2.953H15.83c-1.491 0-1.956.925-1.956 1.874V12h3.328l-.532 3.47h-2.796v8.385C19.612 22.954 24 17.99 24 12z" />
        </svg>
      )}
      {humanSource(source)}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

export default function AdminLeadsList() {
  const router = useRouter();
  const leadsData = useQuery(api.leads.list);
  const leads: Lead[] = (leadsData ?? []) as Lead[];
  const loading = leadsData === undefined;
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterQualification, setFilterQualification] = useState<string>("all");
  const [sortField, setSortField] = useState<"company" | "contactName" | "contactEmail" | "source" | "status" | "qualification" | "_creationTime">("_creationTime");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

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

  const filteredLeads = leads
    .filter((l) => {
      if (filterStatus !== "all" && l.status !== filterStatus) return false;
      if (filterQualification !== "all") {
        if (filterQualification === "unset") {
          if (l.qualification) return false;
        } else if (l.qualification !== filterQualification) {
          return false;
        }
      }
      return true;
    })
    .slice()
    .sort((a: any, b: any) => {
      const av = a[sortField] ?? "";
      const bv = b[sortField] ?? "";
      if (av === bv) return 0;
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });

  const panelOpen = showAddPanel;

  if (loading) {
    return <div className="text-center py-12 text-[var(--muted)] text-sm">Loading...</div>;
  }

  return (
    <>
      {/* Page heading */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--foreground)]">Leads</h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            Track and manage prospective clients
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <FilterDropdown
            label="Pipeline"
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: "all", label: "All", count: leads.length },
              ...LEAD_STATUS_ORDER
                .map((v) => ({
                  value: v,
                  label: LEAD_STATUS_CONFIG[v].label,
                  count: leads.filter((l) => l.status === v).length,
                  dot: LEAD_STATUS_CONFIG[v].dot,
                }))
                .filter((o) => o.count > 0),
            ]}
          />
          <FilterDropdown
            label="Quality"
            value={filterQualification}
            onChange={setFilterQualification}
            options={[
              { value: "all", label: "All" },
              ...QUALIFICATION_ORDER.map((v) => ({
                value: v,
                label: QUALIFICATION_CONFIG[v].label,
                count: leads.filter((l) => l.qualification === v).length,
                dot: QUALIFICATION_CONFIG[v].dot,
              })),
              {
                value: "unset",
                label: "Unreviewed",
                count: leads.filter((l) => !l.qualification).length,
              },
            ]}
          />
          <button
            onClick={() => { setShowAddPanel(true); setSelectedLead(null); }}
            className="px-4 py-2 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition whitespace-nowrap"
          >
            + Add Lead
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        <div>
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b border-[var(--border)]">
                {([
                  { key: "company", label: "Company", width: "w-[28%]" },
                  { key: "contactName", label: "Contact", width: "w-[18%]" },
                  { key: "contactEmail", label: "Email", width: "w-[6%]" },
                  { key: "source", label: "Source", width: "w-[15%]" },
                  { key: "status", label: "Status", width: "w-[13%]" },
                  { key: "qualification", label: "Quality", width: "w-[10%]" },
                  { key: "_creationTime", label: "Added", width: "w-[10%]" },
                ] as const).map((col) => {
                  const active = sortField === col.key;
                  return (
                    <th
                      key={col.key}
                      className={`${col.width} px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap cursor-pointer select-none group/sort`}
                      onClick={() => toggleSort(col.key as any)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {active ? (
                          <svg className="w-3 h-3 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            {sortDir === "asc" ? (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            )}
                          </svg>
                        ) : (
                          <svg className="w-3 h-3 opacity-0 group-hover/sort:opacity-40 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                          </svg>
                        )}
                      </span>
                    </th>
                  );
                })}
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
                    onClick={() => router.push(`/admin/crm/leads/${lead._id}`)}
                    className="border-b border-[var(--border)] hover:bg-[var(--hover-tan)] cursor-pointer transition"
                  >
                    <td className="px-2 py-3 font-medium text-[var(--foreground)] truncate">
                      {lead.company}
                    </td>
                    <td className="px-2 py-3 text-[var(--foreground)] truncate">
                      <div className="truncate">
                        <span>{lead.contactName || "\u2014"}</span>
                        {lead.contactRole && (
                          <span className="text-xs text-[var(--muted)] ml-1">({lead.contactRole})</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-[var(--muted)]">
                      {lead.contactEmail ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(lead.contactEmail);
                            setCopiedEmail(lead._id);
                            setTimeout(() => setCopiedEmail(null), 1500);
                          }}
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition ${
                            copiedEmail === lead._id
                              ? "text-[var(--success-text)] bg-emerald-50"
                              : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--hover-tan)]"
                          }`}
                          title={copiedEmail === lead._id ? "Copied!" : `Copy ${lead.contactEmail}`}
                        >
                          {copiedEmail === lead._id ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                            </svg>
                          )}
                        </button>
                      ) : (
                        <span className="text-xs">—</span>
                      )}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap">
                      <SourceBadge source={lead.source} />
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap">
                      <LeadStatusBadge status={lead.status} />
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap">
                      <QualificationBadge qualification={lead.qualification} />
                    </td>
                    <td className="px-2 py-3 text-xs text-[var(--muted)] whitespace-nowrap">
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

export function LeadSlidePanel({
  lead,
  onSave,
  onQualificationChange,
  onDelete,
  onClose,
  onAddToClients,
  inline = false,
}: {
  lead: Lead | null;
  onSave: (data: Partial<Lead>) => void;
  onQualificationChange?: (q: "qualified" | "unqualified" | "converted" | "unset", extras?: { value?: number; currency?: string }) => void;
  onDelete?: () => void;
  onClose: () => void;
  onAddToClients?: () => void;
  inline?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"details" | "activity">("details");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const handleDeleteClick = () => {
    if (!onDelete) return;
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3000);
      return;
    }
    onDelete();
  };
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

  const content = (
    <div
      ref={panelRef}
      className={
        inline
          ? "relative w-full bg-white rounded-xl border border-[var(--border)] overflow-hidden flex flex-col"
          : `relative w-full max-w-[50%] max-md:max-w-full h-full bg-white shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
              visible ? "translate-x-0" : "translate-x-full"
            }`
      }
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`flex items-center justify-between px-6 ${
          inline ? "py-5" : "py-3"
        } border-b border-[var(--border)] shrink-0`}
        style={inline ? undefined : { background: "#F0EEE6" }}
      >
          <div className="flex items-center gap-3 min-w-0">
            {inline ? (
              <>
                <button
                  onClick={handleClose}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M15.7 5.3a1 1 0 0 1 0 1.4L10.4 12l5.3 5.3a1 1 0 1 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0z" />
                  </svg>
                  All Leads
                </button>
                <span className="text-xs text-[var(--muted)] shrink-0">—</span>
                <span className="text-xl font-bold text-[var(--foreground)] truncate">
                  {lead?.company ?? "New Lead"}
                </span>
              </>
            ) : lead ? (
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
          {inline && lead ? (
            <div className="flex items-center gap-3 text-xs font-medium text-[var(--muted)] shrink-0">
              <span>
                {Math.max(0, Math.floor((Date.now() - lead._creationTime) / 86400000))} days
              </span>
              <span className="inline-block w-px h-3.5 bg-[var(--border)]" />
              <span>
                {new Date(lead._creationTime).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          ) : null}
          {!inline && (
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg hover:bg-[#E8E1CF] text-[var(--muted)] hover:text-[var(--foreground)] transition shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
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
                      className={`inline-flex items-center gap-2 font-medium rounded-full px-4 py-2 text-sm transition border ${
                        isSelected
                          ? `${c.bg} ${c.text} border-transparent shadow-sm`
                          : "bg-white border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--hover-tan)]"
                      }`}
                    >
                      <span
                        className="inline-block rounded-full shrink-0"
                        style={{ width: 8, height: 8, backgroundColor: c.dot }}
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
              <div className="rounded-xl border border-[var(--border)] p-5" style={{ background: "#FAF9F5" }}>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-[var(--foreground)]">
                    Lead Quality (for Ads Optimization)
                  </label>
                  {lead.qualificationChangedAt && (
                    <span className="text-[11px] text-[#6B705C]">
                      Updated{" "}
                      {new Date(lead.qualificationChangedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#6B705C] mb-3">
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
                        className={`inline-flex items-center gap-2 font-medium rounded-full px-4 py-2 text-sm transition bg-white border ${
                          isSelected
                            ? "border-[var(--accent)] text-[var(--foreground)] shadow-sm"
                            : "border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--hover-tan)]"
                        }`}
                      >
                        <span
                          className="inline-block rounded-full shrink-0"
                          style={{ width: 8, height: 8, backgroundColor: c.dot }}
                        />
                        {c.label}
                      </button>
                    );
                  })}
                  {lead.qualification && (
                    <button
                      onClick={() => onQualificationChange?.("unset")}
                      className="text-xs text-[#6B705C] hover:text-[var(--foreground)] px-2 py-1"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Deal value — only relevant when Converted */}
                {(lead.qualification === "converted" || lead.qualification === undefined) && (
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    <div className="col-span-2">
                      <label className="block text-[11px] font-medium text-[#6B705C] mb-1 uppercase tracking-wide">
                        Deal Value (for Purchase event)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onBlur={() => {
                          onSave({ value: parsedValue, currency });
                        }}
                        className="w-full px-3 py-2 text-sm bg-white border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)]"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#6B705C] mb-1 uppercase tracking-wide">
                        Currency
                      </label>
                      <FilterDropdown
                        fullWidth
                        label=""
                        value={currency}
                        onChange={(v) => {
                          setCurrency(v);
                          onSave({ value: parsedValue, currency: v });
                        }}
                        options={[
                          { value: "USD", label: "USD" },
                          { value: "CAD", label: "CAD" },
                          { value: "EUR", label: "EUR" },
                          { value: "GBP", label: "GBP" },
                        ]}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {lead && (
              <div className="border-b border-[var(--border)] flex items-center gap-1 -mx-6 px-6">
                {(["details", "activity"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setActiveTab(t)}
                    className={`px-4 py-2.5 text-sm transition border-b-2 -mb-px ${
                      activeTab === t
                        ? "border-[var(--accent)] text-[var(--accent)] font-semibold"
                        : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {t === "details" ? "Details" : "Activity Log"}
                  </button>
                ))}
              </div>
            )}

            {lead && activeTab === "activity" ? (
              <div className="-mx-6 -mb-5">
                <LeadActivityLog leadId={lead._id} company={lead.company} />
              </div>
            ) : (
            <>
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

            </>
            )}
          </div>
        </div>

      <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)] shrink-0" style={{ background: "#F0EEE6" }}>
          <div>
            {onDelete && (
              <button
                onClick={handleDeleteClick}
                className={`text-sm font-medium transition ${
                  deleteConfirm
                    ? "text-white bg-rose-600 hover:bg-rose-700 px-3 py-1.5 rounded-md"
                    : "text-rose-500 hover:text-rose-700"
                }`}
              >
                {deleteConfirm ? "Click again to confirm" : "Delete"}
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
            {lead && (status === "won" || lead.qualification === "converted") && onAddToClients ? (
              <button
                onClick={onAddToClients}
                className="px-4 py-2 text-sm font-semibold text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition"
              >
                Add to Clients
              </button>
            ) : (
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
            )}
          </div>
        </div>
    </div>
  );

  if (inline) {
    return content;
  }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[100] flex justify-end" onClick={handleClose}>
      <div
        className={`absolute inset-0 transition-opacity duration-200 ${
          visible ? "bg-black/30" : "bg-black/0"
        }`}
      />
      {content}
    </div>,
    document.body
  );
}
