"use client";

import { useState, useEffect, useCallback } from "react";
import { ClientConfig, CreateClientInput } from "@/types";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import FilterDropdown from "./FilterDropdown";

const BOOKING_OPTIONS = [
  { label: "Andreas - 15min", value: "https://cal.com/andres-agudelo-hqlknm/15min" },
];

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function extractNotionPageId(url: string): string {
  if (!url) return "";
  const match = url.match(/([a-f0-9]{32})(?:\?|$)/);
  if (match) return match[1];
  const dashMatch = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
  if (dashMatch) return dashMatch[1].replace(/-/g, "");
  return "";
}

const SERVICE_ACCOUNT_EMAIL = "insightpulse@gen-lang-client-0803026287.iam.gserviceaccount.com";

function CopyServiceAccountButton() {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(SERVICE_ACCOUNT_EMAIL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);
  return (
    <button type="button" onClick={handleCopy}
      className="ml-2 px-1.5 py-0.5 text-[10px] font-medium rounded bg-[#FFF3E0] text-[#FF9500] hover:bg-[#FFE0B2] transition whitespace-nowrap"
      title={SERVICE_ACCOUNT_EMAIL}
    >
      {copied ? "Copied!" : "Copy service account"}
    </button>
  );
}

interface ClientFormModalProps {
  client?: ClientConfig | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ClientFormModal({ client, onClose, onSaved }: ClientFormModalProps) {
  const isEditing = !!client;

  // Required fields
  const [name, setName] = useState(client?.name || "");
  const [contactName, setContactName] = useState(client?.contactName || "");
  const [contactEmail, setContactEmail] = useState(client?.contactEmail || "");
  const [contactPhone, setContactPhone] = useState(client?.contactPhone || "");
  const [accountSpecialist, setAccountSpecialist] = useState(client?.accountSpecialist || "");

  // Optional fields
  const [notionPageUrl, setNotionPageUrl] = useState(client?.notionPageUrl || "");
  const [ga4PropertyId, setGa4PropertyId] = useState(client?.ga4PropertyId?.replace("properties/", "") || "");
  const [gscSiteUrl, setGscSiteUrl] = useState(client?.gscSiteUrl?.replace("sc-domain:", "") || "");
  const [calLink, setCalLink] = useState(client?.calLink || BOOKING_OPTIONS[0].value);
  const [customCalLink, setCustomCalLink] = useState("");
  const [isCustomBooking, setIsCustomBooking] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState(client?.websiteUrl || "");
  const [industry, setIndustry] = useState(client?.industry || "");
  const [active, setActive] = useState(client?.active ?? true);

  // UI state
  const [showOptional, setShowOptional] = useState(isEditing);
  const { teamMembers } = useTeamMembers();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (client?.calLink && !BOOKING_OPTIONS.some((o) => o.value === client.calLink)) {
      setIsCustomBooking(true);
      setCustomCalLink(client.calLink);
    }
  }, [client]);

  const slug = generateSlug(name);
  const notionPageId = extractNotionPageId(notionPageUrl);
  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    setError("");

    const finalCalLink = isCustomBooking ? customCalLink : calLink;

    const body: CreateClientInput = {
      name: name.trim(),
      notionPageUrl,
      ga4PropertyId,
      gscSiteUrl,
      calLink: finalCalLink,
      active,
      clientStatus: "new",
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
      contactPhone: contactPhone.trim(),
      accountSpecialist,
      websiteUrl,
      industry,
    };

    try {
      const url = isEditing ? `/api/admin/clients/${client!.id}` : "/api/admin/clients";
      const method = isEditing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm overflow-hidden">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full mx-4 my-[50px] max-h-[calc(100vh-100px)] flex flex-col">
        <h2 className="text-lg font-semibold px-8 pt-8 pb-4 shrink-0">
          {isEditing ? "Edit Client" : "Add Client"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto px-8 pb-8">
          {/* ── Required: Basic Info ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Name <span className="text-red-400">*</span>
            </label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Century Plaza" autoFocus required className={inputClass} />
            {slug && <p className="text-xs text-gray-400 mt-1">Dashboard URL: /{slug}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
            <input type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://example.com" className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
            <input type="text" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Real Estate, HVAC, Dental" className={inputClass} />
          </div>

          {/* ── Required: Primary Contact ── */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Primary Contact</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Name <span className="text-red-400">*</span>
                </label>
                <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="John Smith" required className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email <span className="text-red-400">*</span>
                  </label>
                  <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="john@example.com" required className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="(555) 123-4567" className={inputClass} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Required: Account Specialist ── */}
          <div className="border-t border-gray-100 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account Specialist <span className="text-red-400">*</span>
            </label>
            <FilterDropdown
              label=""
              value={accountSpecialist}
              onChange={(v) => setAccountSpecialist(v)}
              options={[
                { value: "", label: "Select specialist..." },
                ...teamMembers.map((m) => ({ value: m.name, label: m.name })),
              ]}
              fullWidth
            />
          </div>

          {/* ── Optional: Integrations & Settings ── */}
          <div className="border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => setShowOptional(!showOptional)}
              className="flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition w-full"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${showOptional ? "rotate-90" : ""}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <span className="font-medium">Integrations & Settings</span>
              <span className="text-xs text-gray-400">(optional)</span>
            </button>

            {showOptional && (
              <div className="space-y-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notion Page URL</label>
                  <input type="url" value={notionPageUrl} onChange={(e) => setNotionPageUrl(e.target.value)} placeholder="https://www.notion.so/..." className={inputClass} />
                  {notionPageId && <p className="text-xs text-gray-400 mt-1">Page ID: {notionPageId}</p>}
                </div>

                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-sm font-medium text-gray-700">GA4 Property ID</label>
                    <CopyServiceAccountButton />
                  </div>
                  <input type="text" value={ga4PropertyId} onChange={(e) => setGa4PropertyId(e.target.value)} placeholder="e.g. 123456789" className={inputClass} />
                </div>

                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-sm font-medium text-gray-700">Search Console URL</label>
                    <CopyServiceAccountButton />
                  </div>
                  <input type="text" value={gscSiteUrl} onChange={(e) => setGscSiteUrl(e.target.value)} placeholder="e.g. example.com" className={inputClass} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Booking Link</label>
                  <FilterDropdown
                    label=""
                    value={isCustomBooking ? "__custom__" : calLink}
                    onChange={(v) => {
                      if (v === "__custom__") setIsCustomBooking(true);
                      else { setIsCustomBooking(false); setCalLink(v); }
                    }}
                    options={[
                      ...BOOKING_OPTIONS.map((opt) => ({ value: String(opt.value), label: opt.label })),
                      { value: "__custom__", label: "Custom" },
                    ]}
                    fullWidth
                  />
                  {isCustomBooking && (
                    <input type="url" value={customCalLink} onChange={(e) => setCustomCalLink(e.target.value)} placeholder="https://cal.com/..." className={inputClass + " mt-2"} />
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" id="active" checked={active} onChange={(e) => setActive(e.target.checked)} className="rounded border-gray-300 text-[#FF9500] focus:ring-[#FF9500]" />
                  <label htmlFor="active" className="text-sm text-gray-700">Active</label>
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !contactName.trim() || !contactEmail.trim() || !accountSpecialist || submitting}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#FF9500] rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "..." : isEditing ? "Save Changes" : "Add Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
