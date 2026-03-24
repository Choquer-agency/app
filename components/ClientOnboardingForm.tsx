"use client";

import { useState, useEffect, useCallback } from "react";
import { TeamMember } from "@/types";

const SERVICE_ACCOUNT_EMAIL =
  "insightpulse@gen-lang-client-0803026287.iam.gserviceaccount.com";

function CopyServiceAccountButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(SERVICE_ACCOUNT_EMAIL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--accent-light)] text-[var(--accent)] hover:opacity-80 transition whitespace-nowrap"
      title={SERVICE_ACCOUNT_EMAIL}
    >
      {copied ? "Copied!" : "Copy service account"}
    </button>
  );
}

const BOOKING_OPTIONS = [
  {
    label: "Andreas - 15min",
    value: "https://cal.com/andres-agudelo-hqlknm/15min",
  },
];

const STATUS_OPTIONS = [
  { value: "new", label: "New Client" },
  { value: "active", label: "Active" },
  { value: "offboarding", label: "Offboarding" },
];

const COUNTRY_OPTIONS = [
  { value: "CA", label: "Canada" },
  { value: "US", label: "United States" },
];

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

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function extractNotionPageId(url: string): string {
  if (!url) return "";
  const match = url.match(/([a-f0-9]{32})(?:\?|$)/);
  if (match) return match[1];
  const dashMatch = url.match(
    /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/
  );
  if (dashMatch) return dashMatch[1].replace(/-/g, "");
  return "";
}

interface ClientOnboardingFormProps {
  onSaved: (slug: string) => void;
  onCancel: () => void;
}

export default function ClientOnboardingForm({ onSaved, onCancel }: ClientOnboardingFormProps) {
  const [form, setForm] = useState({
    name: "",
    websiteUrl: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    country: "CA",
    industry: "",
    clientStatus: "new",
    notionPageUrl: "",
    ga4PropertyId: "",
    gscSiteUrl: "",
    seRankingsProjectId: "",
    calLink: BOOKING_OPTIONS[0].value,
    isCustomBooking: false,
    customCalLink: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    provinceState: "",
    postalCode: "",
    accountSpecialist: "",
    socialLinkedin: "",
    socialFacebook: "",
    socialInstagram: "",
    socialX: "",
  });

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    basic: true,
    contact: true,
    address: true,
    billing: true,
    integrations: true,
    social: false,
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    fetch("/api/admin/team")
      .then((res) => (res.ok ? res.json() : []))
      .then(setTeamMembers)
      .catch(() => {});
  }, []);

  function update(key: string, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSection(section: string) {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }

  const slug = generateSlug(form.name);
  const notionPageId = extractNotionPageId(form.notionPageUrl);

  const finalCalLink = form.isCustomBooking ? form.customCalLink : form.calLink;

  const isFormValid =
    form.name.trim() &&
    form.websiteUrl.trim() &&
    form.industry.trim() &&
    form.contactName.trim() &&
    form.contactEmail.trim() &&
    form.contactPhone.trim() &&
    form.accountSpecialist &&
    form.notionPageUrl.trim() &&
    form.ga4PropertyId.trim() &&
    form.gscSiteUrl.trim() &&
    form.seRankingsProjectId.trim() &&
    finalCalLink.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid || submitting) return;

    setSubmitting(true);
    setError("");

    const body = {
      name: form.name.trim(),
      websiteUrl: form.websiteUrl,
      contactName: form.contactName,
      contactEmail: form.contactEmail,
      contactPhone: form.contactPhone,
      country: form.country,
      industry: form.industry,
      clientStatus: form.clientStatus,
      notionPageUrl: form.notionPageUrl,
      ga4PropertyId: form.ga4PropertyId,
      gscSiteUrl: form.gscSiteUrl,
      seRankingsProjectId: form.seRankingsProjectId,
      calLink: finalCalLink,
      addressLine1: form.addressLine1,
      addressLine2: form.addressLine2,
      city: form.city,
      provinceState: form.provinceState,
      postalCode: form.postalCode,
      accountSpecialist: form.accountSpecialist,
      socialLinkedin: form.socialLinkedin,
      socialFacebook: form.socialFacebook,
      socialInstagram: form.socialInstagram,
      socialX: form.socialX,
      active: true,
    };

    try {
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create client");
      }

      onSaved(data.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent";
  const labelClass = "block text-sm font-medium text-[var(--foreground)] mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormSection title="Basic Info" isOpen={openSections.basic} onToggle={() => toggleSection("basic")}>
        <div>
          <label className={labelClass}>Business Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g. Century Plaza"
            autoFocus
            required
            className={inputClass}
          />
          {slug && (
            <p className="text-xs text-[var(--muted)] mt-1">Dashboard URL: /{slug}</p>
          )}
        </div>
        <div>
          <label className={labelClass}>Website URL *</label>
          <input
            type="text"
            value={form.websiteUrl}
            onChange={(e) => update("websiteUrl", e.target.value)}
            placeholder="https://example.com"
            required
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Industry *</label>
            <input
              type="text"
              value={form.industry}
              onChange={(e) => update("industry", e.target.value)}
              placeholder="e.g. Real Estate"
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Country *</label>
            <select
              value={form.country}
              onChange={(e) => update("country", e.target.value)}
              required
              className={`${inputClass} bg-white`}
            >
              {COUNTRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass}>Client Status *</label>
          <div className="flex gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => update("clientStatus", opt.value)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                  form.clientStatus === opt.value
                    ? opt.value === "offboarding"
                      ? "bg-[#FFA69E] text-[#b91c1c]"
                      : opt.value === "new"
                        ? "bg-[#BDFFE8] text-[#0d7a55]"
                        : "bg-[#B1D0FF] text-[#1a56db]"
                    : "bg-gray-100 text-[var(--muted)] hover:bg-gray-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </FormSection>

      <FormSection title="Primary Contact" isOpen={openSections.contact} onToggle={() => toggleSection("contact")}>
        <div>
          <label className={labelClass}>Contact Name *</label>
          <input
            type="text"
            value={form.contactName}
            onChange={(e) => update("contactName", e.target.value)}
            placeholder="John Smith"
            required
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Email *</label>
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => update("contactEmail", e.target.value)}
              placeholder="john@example.com"
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Phone *</label>
            <input
              type="tel"
              value={form.contactPhone}
              onChange={(e) => update("contactPhone", e.target.value)}
              placeholder="+1 (555) 123-4567"
              required
              className={inputClass}
            />
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

      <FormSection title="Account" isOpen={openSections.billing} onToggle={() => toggleSection("billing")}>
        <div>
          <label className={labelClass}>Account Specialist *</label>
          <select
            value={form.accountSpecialist}
            onChange={(e) => update("accountSpecialist", e.target.value)}
            required
            className={`${inputClass} bg-white`}
          >
            <option value="">Select a team member</option>
            {teamMembers.filter((m) => m.active).map((m) => (
              <option key={m.id} value={m.name}>{m.name}{m.role ? ` — ${m.role}` : ""}</option>
            ))}
          </select>
        </div>
      </FormSection>

      <FormSection title="Integrations — InsightPulse" isOpen={openSections.integrations} onToggle={() => toggleSection("integrations")}>
        <div>
          <label className={labelClass}>Notion Page URL *</label>
          <input
            type="url"
            value={form.notionPageUrl}
            onChange={(e) => update("notionPageUrl", e.target.value)}
            placeholder="https://www.notion.so/..."
            required
            className={inputClass}
          />
          {notionPageId && (
            <p className="text-xs text-[var(--muted)] mt-1">Page ID: {notionPageId}</p>
          )}
        </div>
        <div>
          <div className="flex items-center mb-1">
            <label className="text-sm font-medium text-[var(--foreground)]">GA4 Property ID *</label>
            <CopyServiceAccountButton />
          </div>
          <input
            type="text"
            value={form.ga4PropertyId}
            onChange={(e) => update("ga4PropertyId", e.target.value)}
            placeholder="e.g. 123456789"
            required
            className={inputClass}
          />
        </div>
        <div>
          <div className="flex items-center mb-1">
            <label className="text-sm font-medium text-[var(--foreground)]">Search Console URL *</label>
            <CopyServiceAccountButton />
          </div>
          <input
            type="text"
            value={form.gscSiteUrl}
            onChange={(e) => update("gscSiteUrl", e.target.value)}
            placeholder="e.g. example.com"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[var(--foreground)]">SE Ranking ID *</label>
          <input
            type="text"
            value={form.seRankingsProjectId}
            onChange={(e) => update("seRankingsProjectId", e.target.value)}
            placeholder="1234567890"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Booking Link *</label>
          <select
            value={form.isCustomBooking ? "__custom__" : form.calLink}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                update("isCustomBooking", true);
              } else {
                update("isCustomBooking", false);
                update("calLink", e.target.value);
              }
            }}
            className={`${inputClass} bg-white`}
          >
            {BOOKING_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
            <option value="__custom__">Custom</option>
          </select>
          {form.isCustomBooking && (
            <input
              type="url"
              value={form.customCalLink}
              onChange={(e) => update("customCalLink", e.target.value)}
              placeholder="https://cal.com/..."
              required
              className={`${inputClass} mt-2`}
            />
          )}
        </div>
      </FormSection>

      <FormSection title="Social Media (Optional)" isOpen={openSections.social} onToggle={() => toggleSection("social")}>
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
          disabled={!isFormValid || submitting}
          className="px-6 py-2.5 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition disabled:opacity-50"
        >
          {submitting ? "Creating Client..." : "Create Client"}
        </button>
      </div>
    </form>
  );
}
