"use client";

import { useState, useEffect } from "react";
import { ClientConfig, TeamMember } from "@/types";

interface ClientDetailsFormProps {
  client: ClientConfig;
  onSaved: (client: ClientConfig) => void;
  onCancel: () => void;
}

const STATUS_OPTIONS = [
  { value: "new", label: "New Client" },
  { value: "active", label: "Active" },
  { value: "offboarding", label: "Offboarding" },
  { value: "inactive", label: "Inactive" },
];

const COUNTRY_OPTIONS = [
  { value: "CA", label: "Canada" },
  { value: "US", label: "United States" },
];

// Collapsible section — defined outside render to prevent input focus loss
function FormSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between bg-[var(--accent-light)] hover:opacity-90 transition text-sm font-medium text-[var(--foreground)]"
      >
        {title}
        <span className="text-[var(--muted)]">{isOpen ? "−" : "+"}</span>
      </button>
      {isOpen && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

export default function ClientDetailsForm({
  client,
  onSaved,
  onCancel,
}: ClientDetailsFormProps) {
  const [form, setForm] = useState({
    name: client.name,
    websiteUrl: client.websiteUrl,
    contactName: client.contactName,
    contactEmail: client.contactEmail,
    contactPhone: client.contactPhone,
    mrr: client.mrr,
    country: client.country,
    accountSpecialist: client.accountSpecialist,
    seoHoursAllocated: client.seoHoursAllocated,
    addressLine1: client.addressLine1,
    addressLine2: client.addressLine2,
    city: client.city,
    provinceState: client.provinceState,
    postalCode: client.postalCode,
    clientStatus: client.clientStatus,
    offboardingDate: client.offboardingDate || "",
    industry: client.industry,
    nextReviewDate: client.nextReviewDate || "",
    socialLinkedin: client.socialLinkedin,
    socialFacebook: client.socialFacebook,
    socialInstagram: client.socialInstagram,
    socialX: client.socialX,
    notionPageUrl: client.notionPageUrl,
    ga4PropertyId: client.ga4PropertyId?.replace("properties/", "") || "",
    gscSiteUrl: client.gscSiteUrl?.replace("sc-domain:", "") || "",
    seRankingsProjectId: client.seRankingsProjectId || "",
    calLink: client.calLink,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    basic: true,
    contact: true,
    address: false,
    billing: false,
    integrations: false,
    social: false,
  });

  // Offboarding note state
  const [offboardingNote, setOffboardingNote] = useState("");
  const [showOffboardingPrompt, setShowOffboardingPrompt] = useState(false);

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Team members for specialist dropdown
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  useEffect(() => {
    fetch("/api/admin/team")
      .then((res) => res.ok ? res.json() : [])
      .then((members) => setTeamMembers(members))
      .catch(() => {});
  }, []);

  function update(key: string, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSection(section: string) {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }

  function handleStatusChange(newStatus: string) {
    update("clientStatus", newStatus);
    if (newStatus === "offboarding") {
      setShowOffboardingPrompt(true);
    } else {
      setShowOffboardingPrompt(false);
      update("offboardingDate", "");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      const updated = await res.json();

      // If offboarding was set and there's a note, add it
      if (form.clientStatus === "offboarding" && offboardingNote.trim()) {
        await fetch(`/api/admin/clients/${client.id}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteType: "status_change",
            content: `Client moved to offboarding. Last working day: ${form.offboardingDate || "TBD"}. ${offboardingNote}`,
          }),
        });
      }

      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }
      window.location.href = "/admin/clients";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete client");
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent";
  const labelClass = "block text-sm font-medium text-[var(--foreground)] mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormSection title="Basic Info" isOpen={openSections.basic} onToggle={() => toggleSection("basic")}>
        <div>
          <label className={labelClass}>Business Name</label>
          <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Website URL</label>
          <input type="text" value={form.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} placeholder="https://example.com" className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Industry</label>
            <input type="text" value={form.industry} onChange={(e) => update("industry", e.target.value)} placeholder="e.g. Real Estate" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Country</label>
            <select value={form.country} onChange={(e) => update("country", e.target.value)} className={`${inputClass} bg-white`}>
              {COUNTRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass}>Client Status</label>
          <div className="flex gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleStatusChange(opt.value)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                  form.clientStatus === opt.value
                    ? opt.value === "offboarding"
                      ? "bg-[#FFA69E] text-[#b91c1c]"
                      : opt.value === "new"
                        ? "bg-[#BDFFE8] text-[#0d7a55]"
                        : opt.value === "inactive"
                          ? "bg-gray-200 text-gray-600"
                          : "bg-[#B1D0FF] text-[#1a56db]"
                    : "bg-gray-100 text-[var(--muted)] hover:bg-gray-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {(form.clientStatus === "offboarding" || showOffboardingPrompt) && (
          <div className="border border-[#FFA69E] rounded-lg p-4 space-y-3 bg-red-50">
            <div>
              <label className={labelClass}>Last Working Day</label>
              <input type="date" value={form.offboardingDate} onChange={(e) => update("offboardingDate", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Note for the team</label>
              <textarea
                value={offboardingNote}
                onChange={(e) => setOffboardingNote(e.target.value)}
                placeholder="Reason for offboarding, anything the team should know..."
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
        )}
      </FormSection>

      <FormSection title="Primary Contact" isOpen={openSections.contact} onToggle={() => toggleSection("contact")}>
        <div>
          <label className={labelClass}>Contact Name</label>
          <input type="text" value={form.contactName} onChange={(e) => update("contactName", e.target.value)} placeholder="John Smith" className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" value={form.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} placeholder="john@example.com" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input type="tel" value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} placeholder="+1 (555) 123-4567" className={inputClass} />
          </div>
        </div>
      </FormSection>

      <FormSection title="Address" isOpen={openSections.address} onToggle={() => toggleSection("address")}>
        <div>
          <label className={labelClass}>Address Line 1</label>
          <input type="text" value={form.addressLine1} onChange={(e) => update("addressLine1", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Address Line 2</label>
          <input type="text" value={form.addressLine2} onChange={(e) => update("addressLine2", e.target.value)} className={inputClass} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>City</label>
            <input type="text" value={form.city} onChange={(e) => update("city", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Province/State</label>
            <input type="text" value={form.provinceState} onChange={(e) => update("provinceState", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Postal Code</label>
            <input type="text" value={form.postalCode} onChange={(e) => update("postalCode", e.target.value)} className={inputClass} />
          </div>
        </div>
      </FormSection>

      <FormSection title="Account & Billing" isOpen={openSections.billing} onToggle={() => toggleSection("billing")}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Monthly Recurring Revenue</label>
            <p className="px-3 py-2 text-sm text-[var(--muted)] bg-gray-50 rounded-lg border border-[var(--border)]">
              ${client.mrr.toLocaleString()}/mo <span className="text-xs">(calculated from packages)</span>
            </p>
          </div>
          <div>
            <label className={labelClass}>SEO Hours / Month</label>
            <input type="text" inputMode="decimal" value={form.seoHoursAllocated || ""} onChange={(e) => update("seoHoursAllocated", parseFloat(e.target.value) || 0)} placeholder="e.g. 5" className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Account Specialist</label>
          <select value={form.accountSpecialist} onChange={(e) => update("accountSpecialist", e.target.value)} className={`${inputClass} bg-white`}>
            <option value="">Select a team member</option>
            {teamMembers.filter((m) => m.active).map((m) => (
              <option key={m.id} value={m.name}>{m.name}{m.role ? ` — ${m.role}` : ""}</option>
            ))}
            {form.accountSpecialist && !teamMembers.some((m) => m.name === form.accountSpecialist) && (
              <option value={form.accountSpecialist}>{form.accountSpecialist}</option>
            )}
          </select>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Contract start &amp; end dates are set per-package in the Packages &amp; Billing tab.
        </p>
      </FormSection>

      <FormSection title="Integrations — InsightPulse" isOpen={openSections.integrations} onToggle={() => toggleSection("integrations")}>
        <div>
          <label className={labelClass}>Notion Page URL</label>
          <input type="url" value={form.notionPageUrl} onChange={(e) => update("notionPageUrl", e.target.value)} placeholder="https://www.notion.so/..." className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>GA4 Property ID</label>
          <input type="text" value={form.ga4PropertyId} onChange={(e) => update("ga4PropertyId", e.target.value)} placeholder="123456789" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Search Console URL</label>
          <input type="text" value={form.gscSiteUrl} onChange={(e) => update("gscSiteUrl", e.target.value)} placeholder="example.com" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>SE Ranking ID</label>
          <input type="text" value={form.seRankingsProjectId} onChange={(e) => update("seRankingsProjectId", e.target.value)} placeholder="1234567890" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Booking Link</label>
          <input type="url" value={form.calLink} onChange={(e) => update("calLink", e.target.value)} className={inputClass} />
        </div>
      </FormSection>

      <FormSection title="Social Media" isOpen={openSections.social} onToggle={() => toggleSection("social")}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>LinkedIn</label>
            <input type="url" value={form.socialLinkedin} onChange={(e) => update("socialLinkedin", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Facebook</label>
            <input type="url" value={form.socialFacebook} onChange={(e) => update("socialFacebook", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Instagram</label>
            <input type="url" value={form.socialInstagram} onChange={(e) => update("socialInstagram", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>X (Twitter)</label>
            <input type="url" value={form.socialX} onChange={(e) => update("socialX", e.target.value)} className={inputClass} />
          </div>
        </div>
      </FormSection>

      {error && (
        <p className="text-sm text-[#b91c1c] bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2.5 text-sm font-medium text-[var(--foreground)] bg-gray-100 rounded-lg hover:bg-gray-200 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!form.name.trim() || submitting}
          className="px-6 py-2.5 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* Danger Zone — only shown for past/inactive clients */}
      {(client.clientStatus === "inactive" || !client.active) && (
        <div className="border border-red-200 rounded-lg p-4 mt-6 bg-red-50">
          <h3 className="text-sm font-semibold text-[#b91c1c] mb-2">Danger Zone</h3>
          <p className="text-xs text-gray-600 mb-3">
            Permanently delete this client and all associated data. This action cannot be undone.
          </p>
          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 text-sm font-medium text-[#b91c1c] border border-[#b91c1c] rounded-lg hover:bg-red-100 transition"
            >
              Delete Client
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-[#b91c1c]">Are you sure you want to delete this client?</p>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-[#b91c1c] rounded-lg hover:bg-red-800 transition disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Yes, Delete"}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
