"use client";

import { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import FilterDropdown from "./FilterDropdown";
import DatePicker from "./DatePicker";
import { useTeamMembers } from "@/hooks/useTeamMembers";

type Package = {
  id: string | number;
  name: string;
  category: string;
  defaultPrice: number;
  setupFee: number;
  billingFrequency: "monthly" | "annually" | string;
};

type ContractTerm = "month_to_month" | "3_months" | "6_months" | "1_year" | "custom";

type PackageEntry = {
  key: string;
  packageId: string;
  isOneTime: boolean;
  contractTerm: ContractTerm;
  customEndDate: string | null;
  applySetupFee: boolean;
  paidDate: string;
  customPrice: string;
  customHours: string;
};

export type ConvertPackagePayload = {
  packageId: string;
  contractEndDate: string | null;
  applySetupFee: boolean;
  isOneTime: boolean;
  paidDate?: string;
  customPrice?: number | null;
  customHours?: number | null;
};

export type ConvertClientInfo = {
  name: string;
  websiteUrl: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  country: "US" | "CA";
  industry: string;
  accountSpecialist: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  provinceState: string;
  postalCode: string;
  // Integrations
  ga4PropertyId: string;
  gscSiteUrl: string;
  googleAdsCustomerId: string;
  notionPageUrl: string;
  calLink: string;
};

function getDefaultContractTerm(category: string): ContractTerm {
  if (category === "google_ads" || category === "social_media_ads") return "3_months";
  if (category === "seo") return "6_months";
  return "month_to_month";
}

const DATE_INPUT_CLASS =
  "w-full px-3 py-2 text-sm bg-white border border-[var(--border)] rounded-lg hover:border-[var(--accent)] transition";
const INPUT_CLASS =
  "w-full px-3 py-2 text-sm bg-white border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)]";
const LABEL_CLASS = "block text-xs font-medium text-[var(--muted)] mb-1.5";

function newEntryKey() {
  return Math.random().toString(36).slice(2);
}

export default function ConvertLeadModal({
  leadId,
  lead,
  onClose,
  onConvert,
}: {
  leadId: string;
  lead: {
    company?: string;
    website?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
  };
  onClose: () => void;
  onConvert: (args: {
    client: ConvertClientInfo;
    signupDate: string;
    notes?: string;
    packages: ConvertPackagePayload[];
  }) => Promise<void>;
}) {
  const pkgDocs = useQuery(api.packages.list as any, {} as any);
  const packages: Package[] = (pkgDocs ?? []).map((p: any) => ({
    id: p._id,
    name: p.name,
    category: p.category,
    defaultPrice: p.defaultPrice ?? 0,
    setupFee: p.setupFee ?? 0,
    billingFrequency: p.billingFrequency ?? "monthly",
  }));

  const { teamMembers } = useTeamMembers(false);

  // === Step state ===
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // === Step 1: Client info ===
  const [client, setClient] = useState<ConvertClientInfo>(() => ({
    name: lead.company ?? "",
    websiteUrl: lead.website ?? "",
    contactName: lead.contactName ?? "",
    contactEmail: lead.contactEmail ?? "",
    contactPhone: lead.contactPhone ?? "",
    country: "US",
    industry: "",
    accountSpecialist: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    provinceState: "",
    postalCode: "",
    ga4PropertyId: "",
    gscSiteUrl: "",
    googleAdsCustomerId: "",
    notionPageUrl: "",
    calLink: "",
  }));

  function updateClient(field: keyof ConvertClientInfo, value: string) {
    setClient((c) => ({ ...c, [field]: value }));
  }

  const step1Errors: Partial<Record<keyof ConvertClientInfo, string>> = {};
  if (!client.name.trim()) step1Errors.name = "Required";
  if (!client.websiteUrl.trim()) step1Errors.websiteUrl = "Required";
  if (!client.contactName.trim()) step1Errors.contactName = "Required";
  if (!client.contactEmail.trim() || !/@/.test(client.contactEmail))
    step1Errors.contactEmail = "Valid email required";
  if (!client.accountSpecialist) step1Errors.accountSpecialist = "Required";
  const step1Valid = Object.keys(step1Errors).length === 0;

  // === Step 2: Packages ===
  const [signupDate, setSignupDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [entries, setEntries] = useState<PackageEntry[]>([
    {
      key: newEntryKey(),
      packageId: "",
      isOneTime: false,
      contractTerm: "month_to_month",
      customEndDate: null,
      applySetupFee: false,
      paidDate: new Date().toISOString().split("T")[0],
      customPrice: "",
      customHours: "",
    },
  ]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [customOpenKey, setCustomOpenKey] = useState<string | null>(null);

  useEffect(() => {
    if (expandedKey === null && entries.length === 1) setExpandedKey(entries[0].key);
  }, [entries, expandedKey]);

  useEffect(() => {
    if (packages.length === 0) return;
    setEntries((prev) =>
      prev.map((e) => {
        if (e.packageId) return e;
        const pkg = packages[0];
        return {
          ...e,
          packageId: String(pkg.id),
          contractTerm: getDefaultContractTerm(pkg.category),
        };
      })
    );
  }, [packages.length]);

  function updateEntry(key: string, patch: Partial<PackageEntry>) {
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }
  function addEntry() {
    const pkg = packages[0];
    const newKey = newEntryKey();
    setEntries((prev) => [
      ...prev,
      {
        key: newKey,
        packageId: pkg ? String(pkg.id) : "",
        isOneTime: false,
        contractTerm: pkg ? getDefaultContractTerm(pkg.category) : "month_to_month",
        customEndDate: null,
        applySetupFee: false,
        paidDate: new Date().toISOString().split("T")[0],
        customPrice: "",
        customHours: "",
      },
    ]);
    setExpandedKey(newKey);
  }
  function removeEntry(key: string) {
    setEntries((prev) => (prev.length > 1 ? prev.filter((e) => e.key !== key) : prev));
  }
  function computeEndDate(entry: PackageEntry): string | null {
    if (entry.isOneTime) return null;
    if (entry.contractTerm === "month_to_month") return null;
    if (entry.contractTerm === "custom") return entry.customEndDate || null;
    const start = new Date(signupDate);
    const monthsMap = { "3_months": 3, "6_months": 6, "1_year": 12 } as const;
    start.setMonth(start.getMonth() + monthsMap[entry.contractTerm]);
    return start.toISOString().split("T")[0];
  }
  const step2Valid = entries.length > 0 && entries.every((e) => e.packageId);

  // === Step 3: Integrations — required fields depend on selected packages ===
  const selectedPackageCategories = new Set(
    entries
      .map((e) => packages.find((p) => String(p.id) === e.packageId)?.category)
      .filter(Boolean) as string[]
  );
  const needsGA4 = selectedPackageCategories.has("seo");
  const needsGSC = selectedPackageCategories.has("seo");
  const needsGoogleAds = selectedPackageCategories.has("google_ads");

  const step3Errors: Partial<Record<keyof ConvertClientInfo, string>> = {};
  if (needsGA4 && !client.ga4PropertyId.trim())
    step3Errors.ga4PropertyId = "Required for SEO packages";
  if (needsGSC && !client.gscSiteUrl.trim())
    step3Errors.gscSiteUrl = "Required for SEO packages";
  if (needsGoogleAds && !client.googleAdsCustomerId.trim())
    step3Errors.googleAdsCustomerId = "Required for Google Ads packages";
  const step3Valid = Object.keys(step3Errors).length === 0;

  // === Submit ===
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onConvert({
        client,
        signupDate,
        notes: notes.trim() || undefined,
        packages: entries.map((e) => ({
          packageId: e.packageId,
          contractEndDate: computeEndDate(e),
          applySetupFee: e.applySetupFee,
          isOneTime: e.isOneTime,
          paidDate: e.isOneTime ? e.paidDate : undefined,
          customPrice: e.customPrice.trim() === "" ? null : parseFloat(e.customPrice),
          customHours: e.customHours.trim() === "" ? null : parseFloat(e.customHours),
        })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversion failed");
      setSubmitting(false);
    }
  }

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (typeof document === "undefined") return null;

  const packageOptions = packages.map((p) => ({
    value: String(p.id),
    label: `${p.name} — $${p.defaultPrice.toLocaleString()}/${p.billingFrequency === "annually" ? "yr" : "mo"}`,
  }));

  const contractOptions = [
    { value: "month_to_month", label: "Month to month" },
    { value: "3_months", label: "3 months" },
    { value: "6_months", label: "6 months" },
    { value: "1_year", label: "1 year" },
    { value: "custom", label: "Custom" },
  ];

  const specialistOptions = [
    { value: "", label: "Select a team member" },
    ...teamMembers
      .filter((m) => m.active)
      .map((m) => ({
        value: m.name,
        label: `${m.name}${m.role ? ` — ${m.role}` : ""}`,
      })),
  ];

  const steps: { n: 1 | 2 | 3 | 4; label: string }[] = [
    { n: 1, label: "Client" },
    { n: 2, label: "Packages" },
    { n: 3, label: "Integrations" },
    { n: 4, label: "Review" },
  ];

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden"
        style={{ maxHeight: "calc(92vh / 1.1875)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + step indicator */}
        <div className="px-10 pt-6 pb-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-bold text-[var(--foreground)]">Add to Clients</h2>
          <p className="text-xs text-[var(--muted)] mt-1">
            Convert{" "}
            <span className="font-medium text-[var(--foreground)]">
              {client.name || "this lead"}
            </span>{" "}
            into a client. Complete every step so their profile is ready.
          </p>
          <div className="flex items-center gap-2 mt-4">
            {steps.map((s, idx) => (
              <div key={s.n} className="flex items-center gap-2 flex-1">
                <button
                  type="button"
                  onClick={() => {
                    if (s.n === 1) setStep(1);
                    else if (s.n === 2 && step1Valid) setStep(2);
                    else if (s.n === 3 && step1Valid && step2Valid) setStep(3);
                    else if (s.n === 4 && step1Valid && step2Valid && step3Valid) setStep(4);
                  }}
                  className={`flex items-center gap-2 text-xs font-medium transition ${
                    step === s.n
                      ? "text-[var(--accent)]"
                      : step > s.n
                        ? "text-[var(--foreground)]"
                        : "text-[var(--muted)]"
                  }`}
                >
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                      step === s.n
                        ? "bg-[var(--accent)] text-white"
                        : step > s.n
                          ? "bg-emerald-500 text-white"
                          : "bg-[var(--hover-tan)] text-[var(--muted)]"
                    }`}
                  >
                    {step > s.n ? "✓" : s.n}
                  </span>
                  <span className="whitespace-nowrap">{s.label}</span>
                </button>
                {idx < steps.length - 1 && (
                  <div className="flex-1 h-px bg-[var(--border)]" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="space-y-5 overflow-y-auto px-10 py-5">
          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLASS}>Company name *</label>
                  <input
                    value={client.name}
                    onChange={(e) => updateClient("name", e.target.value)}
                    className={INPUT_CLASS}
                  />
                  {step1Errors.name && (
                    <p className="text-[10px] text-rose-500 mt-1">{step1Errors.name}</p>
                  )}
                </div>
                <div>
                  <label className={LABEL_CLASS}>Website *</label>
                  <input
                    value={client.websiteUrl}
                    onChange={(e) => updateClient("websiteUrl", e.target.value)}
                    placeholder="https://..."
                    className={INPUT_CLASS}
                  />
                  {step1Errors.websiteUrl && (
                    <p className="text-[10px] text-rose-500 mt-1">{step1Errors.websiteUrl}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLASS}>Contact name *</label>
                  <input
                    value={client.contactName}
                    onChange={(e) => updateClient("contactName", e.target.value)}
                    className={INPUT_CLASS}
                  />
                  {step1Errors.contactName && (
                    <p className="text-[10px] text-rose-500 mt-1">{step1Errors.contactName}</p>
                  )}
                </div>
                <div>
                  <label className={LABEL_CLASS}>Contact email *</label>
                  <input
                    type="email"
                    value={client.contactEmail}
                    onChange={(e) => updateClient("contactEmail", e.target.value)}
                    className={INPUT_CLASS}
                  />
                  {step1Errors.contactEmail && (
                    <p className="text-[10px] text-rose-500 mt-1">{step1Errors.contactEmail}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLASS}>Contact phone</label>
                  <input
                    value={client.contactPhone}
                    onChange={(e) => updateClient("contactPhone", e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Industry</label>
                  <input
                    value={client.industry}
                    onChange={(e) => updateClient("industry", e.target.value)}
                    placeholder="e.g. Electrical, Roofing"
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLASS}>Country *</label>
                  <FilterDropdown
                    fullWidth
                    label=""
                    value={client.country}
                    onChange={(v) => updateClient("country", v)}
                    options={[
                      { value: "US", label: "United States" },
                      { value: "CA", label: "Canada" },
                    ]}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Account specialist *</label>
                  <FilterDropdown
                    fullWidth
                    label=""
                    value={client.accountSpecialist}
                    onChange={(v) => updateClient("accountSpecialist", v)}
                    options={specialistOptions}
                  />
                  {step1Errors.accountSpecialist && (
                    <p className="text-[10px] text-rose-500 mt-1">{step1Errors.accountSpecialist}</p>
                  )}
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>Address</label>
                <input
                  value={client.addressLine1}
                  onChange={(e) => updateClient("addressLine1", e.target.value)}
                  placeholder="Street address (optional)"
                  className={INPUT_CLASS}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input
                  value={client.city}
                  onChange={(e) => updateClient("city", e.target.value)}
                  placeholder="City"
                  className={INPUT_CLASS}
                />
                <input
                  value={client.provinceState}
                  onChange={(e) => updateClient("provinceState", e.target.value)}
                  placeholder={client.country === "CA" ? "Province" : "State"}
                  className={INPUT_CLASS}
                />
                <input
                  value={client.postalCode}
                  onChange={(e) => updateClient("postalCode", e.target.value)}
                  placeholder={client.country === "CA" ? "Postal" : "ZIP"}
                  className={INPUT_CLASS}
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {packages.length === 0 ? (
                <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2">
                  No packages available — create one in Settings → Packages first.
                </p>
              ) : (
                <div className="space-y-2">
                  {entries.map((entry, idx) => {
                    const selectedPkg = packages.find((p) => String(p.id) === entry.packageId);
                    const isExpanded = expandedKey === entry.key;
                    const termLabel = entry.isOneTime
                      ? "One-time"
                      : contractOptions.find((c) => c.value === entry.contractTerm)?.label ?? "";
                    const priceLabel = entry.customPrice
                      ? `$${Number(entry.customPrice).toLocaleString()}`
                      : selectedPkg
                        ? `$${selectedPkg.defaultPrice.toLocaleString()}`
                        : "";
                    return (
                      <div
                        key={entry.key}
                        className="rounded-xl border border-[var(--border)] overflow-hidden"
                        style={{ background: "#FAF9F5" }}
                      >
                        <div
                          className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--hover-tan)]"
                          onClick={() => setExpandedKey(isExpanded ? null : entry.key)}
                        >
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] shrink-0">
                            #{idx + 1}
                          </span>
                          <span className="flex-1 text-sm font-medium text-[var(--foreground)] truncate">
                            {selectedPkg?.name ?? "Select a package"}
                          </span>
                          <span className="text-xs text-[var(--muted)] whitespace-nowrap">
                            {priceLabel}
                            {termLabel && <span className="mx-1.5">·</span>}
                            {termLabel}
                            {entry.customHours && (
                              <>
                                <span className="mx-1.5">·</span>
                                {entry.customHours}h
                              </>
                            )}
                          </span>
                          {entries.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeEntry(entry.key);
                              }}
                              className="text-xs text-rose-500 hover:text-rose-700 transition shrink-0"
                            >
                              Remove
                            </button>
                          )}
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            className={`text-[var(--muted)] transition ${isExpanded ? "rotate-180" : ""}`}
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </div>

                        {isExpanded && (
                          <div className="border-t border-[var(--border)] p-4 space-y-3">
                            <FilterDropdown
                              fullWidth
                              label=""
                              value={entry.packageId}
                              onChange={(id) => {
                                const pkg = packages.find((p) => String(p.id) === id);
                                updateEntry(entry.key, {
                                  packageId: id,
                                  contractTerm: pkg
                                    ? getDefaultContractTerm(pkg.category)
                                    : entry.contractTerm,
                                });
                              }}
                              options={packageOptions}
                            />

                            <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                              <input
                                type="checkbox"
                                checked={entry.isOneTime}
                                onChange={(e) =>
                                  updateEntry(entry.key, { isOneTime: e.target.checked })
                                }
                                className="accent-[var(--accent)] w-4 h-4"
                              />
                              One-time purchase (not recurring)
                            </label>

                            {entry.isOneTime ? (
                              <div>
                                <label className={LABEL_CLASS}>Paid date</label>
                                <DatePicker
                                  value={entry.paidDate}
                                  onChange={(d) => d && updateEntry(entry.key, { paidDate: d })}
                                  displayFormat="full"
                                  className={DATE_INPUT_CLASS}
                                />
                              </div>
                            ) : (
                              <div>
                                <label className={LABEL_CLASS}>Contract term</label>
                                <FilterDropdown
                                  fullWidth
                                  label=""
                                  value={entry.contractTerm}
                                  onChange={(v) =>
                                    updateEntry(entry.key, { contractTerm: v as ContractTerm })
                                  }
                                  options={contractOptions}
                                />
                              </div>
                            )}

                            {!entry.isOneTime && entry.contractTerm === "custom" && (
                              <div>
                                <label className={LABEL_CLASS}>Contract end date</label>
                                <DatePicker
                                  value={entry.customEndDate}
                                  onChange={(d) => updateEntry(entry.key, { customEndDate: d })}
                                  displayFormat="full"
                                  clearable
                                  className={DATE_INPUT_CLASS}
                                />
                              </div>
                            )}

                            {(() => {
                              const customOpen =
                                customOpenKey === entry.key ||
                                !!entry.customPrice ||
                                !!entry.customHours;
                              return (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCustomOpenKey(
                                        customOpenKey === entry.key ? null : entry.key
                                      )
                                    }
                                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition"
                                  >
                                    <svg
                                      width="10"
                                      height="10"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                      className={`transition ${customOpen ? "rotate-90" : ""}`}
                                    >
                                      <path d="m9 18 6-6-6-6" />
                                    </svg>
                                    Customize price or hours
                                  </button>
                                  {customOpen && (
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <label className={LABEL_CLASS}>Custom price</label>
                                        <input
                                          type="number"
                                          min={0}
                                          step="0.01"
                                          value={entry.customPrice}
                                          onChange={(e) =>
                                            updateEntry(entry.key, { customPrice: e.target.value })
                                          }
                                          placeholder={
                                            selectedPkg ? String(selectedPkg.defaultPrice) : "0.00"
                                          }
                                          className={INPUT_CLASS}
                                        />
                                      </div>
                                      <div>
                                        <label className={LABEL_CLASS}>Custom hours</label>
                                        <input
                                          type="number"
                                          min={0}
                                          step="0.5"
                                          value={entry.customHours}
                                          onChange={(e) =>
                                            updateEntry(entry.key, { customHours: e.target.value })
                                          }
                                          placeholder="e.g. 40"
                                          className={INPUT_CLASS}
                                        />
                                      </div>
                                    </div>
                                  )}
                                </>
                              );
                            })()}

                            {selectedPkg && selectedPkg.setupFee > 0 && (
                              <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                                <input
                                  type="checkbox"
                                  checked={entry.applySetupFee}
                                  onChange={(e) =>
                                    updateEntry(entry.key, { applySetupFee: e.target.checked })
                                  }
                                  className="accent-[var(--accent)] w-4 h-4"
                                />
                                Apply setup fee (${selectedPkg.setupFee})
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={addEntry}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] border border-dashed border-[var(--border)] rounded-lg hover:bg-[var(--hover-tan)] transition"
                  >
                    + Add another package
                  </button>
                </div>
              )}
              <div>
                <label className={LABEL_CLASS}>Signup date</label>
                <DatePicker
                  value={signupDate}
                  onChange={(d) => d && setSignupDate(d)}
                  displayFormat="full"
                  className={DATE_INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-sm bg-white border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 resize-none"
                  placeholder="Any context for this signup..."
                />
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: "#FAF9F5" }}>
                <p className="text-xs text-[var(--muted)]">
                  Connect the integrations the team needs to deliver on this client's packages.
                  Fields marked <span className="text-rose-500">*</span> are required based on the packages you chose.
                </p>
              </div>

              <div>
                <label className={LABEL_CLASS}>
                  GA4 Property ID {needsGA4 && <span className="text-rose-500">*</span>}
                </label>
                <input
                  value={client.ga4PropertyId}
                  onChange={(e) => updateClient("ga4PropertyId", e.target.value)}
                  placeholder="e.g. 123456789"
                  className={INPUT_CLASS}
                />
                {step3Errors.ga4PropertyId && (
                  <p className="text-[10px] text-rose-500 mt-1">{step3Errors.ga4PropertyId}</p>
                )}
              </div>

              <div>
                <label className={LABEL_CLASS}>
                  Search Console Site URL {needsGSC && <span className="text-rose-500">*</span>}
                </label>
                <input
                  value={client.gscSiteUrl}
                  onChange={(e) => updateClient("gscSiteUrl", e.target.value)}
                  placeholder="sc-domain:example.com or https://example.com/"
                  className={INPUT_CLASS}
                />
                {step3Errors.gscSiteUrl && (
                  <p className="text-[10px] text-rose-500 mt-1">{step3Errors.gscSiteUrl}</p>
                )}
              </div>

              <div>
                <label className={LABEL_CLASS}>
                  Google Ads Customer ID {needsGoogleAds && <span className="text-rose-500">*</span>}
                </label>
                <input
                  value={client.googleAdsCustomerId}
                  onChange={(e) => updateClient("googleAdsCustomerId", e.target.value)}
                  placeholder="123-456-7890"
                  className={INPUT_CLASS}
                />
                {step3Errors.googleAdsCustomerId && (
                  <p className="text-[10px] text-rose-500 mt-1">{step3Errors.googleAdsCustomerId}</p>
                )}
              </div>

              <div>
                <label className={LABEL_CLASS}>Notion Page URL</label>
                <input
                  value={client.notionPageUrl}
                  onChange={(e) => updateClient("notionPageUrl", e.target.value)}
                  placeholder="https://notion.so/..."
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Cal Link</label>
                <input
                  value={client.calLink}
                  onChange={(e) => updateClient("calLink", e.target.value)}
                  placeholder="https://cal.com/..."
                  className={INPUT_CLASS}
                />
              </div>
            </>
          )}

          {step === 4 && (
            <div className="space-y-4 text-sm">
              <section className="rounded-xl border border-[var(--border)] p-4" style={{ background: "#FAF9F5" }}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-[var(--foreground)]">Client details</h3>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    Edit
                  </button>
                </div>
                <dl className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs">
                  <div><dt className="text-[var(--muted)]">Company</dt><dd className="text-[var(--foreground)] font-medium">{client.name}</dd></div>
                  <div><dt className="text-[var(--muted)]">Website</dt><dd className="text-[var(--foreground)] truncate">{client.websiteUrl}</dd></div>
                  <div><dt className="text-[var(--muted)]">Contact</dt><dd className="text-[var(--foreground)]">{client.contactName}</dd></div>
                  <div><dt className="text-[var(--muted)]">Email</dt><dd className="text-[var(--foreground)] truncate">{client.contactEmail}</dd></div>
                  {client.contactPhone && <div><dt className="text-[var(--muted)]">Phone</dt><dd className="text-[var(--foreground)]">{client.contactPhone}</dd></div>}
                  <div><dt className="text-[var(--muted)]">Country</dt><dd className="text-[var(--foreground)]">{client.country === "CA" ? "Canada" : "United States"}</dd></div>
                  {client.industry && <div><dt className="text-[var(--muted)]">Industry</dt><dd className="text-[var(--foreground)]">{client.industry}</dd></div>}
                  <div><dt className="text-[var(--muted)]">Specialist</dt><dd className="text-[var(--foreground)]">{client.accountSpecialist}</dd></div>
                </dl>
              </section>

              <section className="rounded-xl border border-[var(--border)] p-4" style={{ background: "#FAF9F5" }}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-[var(--foreground)]">Packages ({entries.length})</h3>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    Edit
                  </button>
                </div>
                <ul className="space-y-2 text-xs">
                  {entries.map((e) => {
                    const pkg = packages.find((p) => String(p.id) === e.packageId);
                    const term = e.isOneTime
                      ? "One-time"
                      : contractOptions.find((c) => c.value === e.contractTerm)?.label;
                    return (
                      <li key={e.key} className="flex items-center justify-between gap-3">
                        <span className="text-[var(--foreground)] font-medium truncate">
                          {pkg?.name ?? "—"}
                        </span>
                        <span className="text-[var(--muted)] whitespace-nowrap">
                          ${Number(e.customPrice || pkg?.defaultPrice || 0).toLocaleString()} · {term}
                          {e.customHours && ` · ${e.customHours}h`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-[11px] text-[var(--muted)] mt-2">
                  Signup date: {signupDate}
                </p>
              </section>

              <section className="rounded-xl border border-[var(--border)] p-4" style={{ background: "#FAF9F5" }}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-[var(--foreground)]">Integrations</h3>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    Edit
                  </button>
                </div>
                <dl className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs">
                  {client.ga4PropertyId && <div><dt className="text-[var(--muted)]">GA4</dt><dd className="text-[var(--foreground)] truncate">{client.ga4PropertyId}</dd></div>}
                  {client.gscSiteUrl && <div><dt className="text-[var(--muted)]">Search Console</dt><dd className="text-[var(--foreground)] truncate">{client.gscSiteUrl}</dd></div>}
                  {client.googleAdsCustomerId && <div><dt className="text-[var(--muted)]">Google Ads</dt><dd className="text-[var(--foreground)]">{client.googleAdsCustomerId}</dd></div>}
                  {client.notionPageUrl && <div><dt className="text-[var(--muted)]">Notion</dt><dd className="text-[var(--foreground)] truncate">{client.notionPageUrl}</dd></div>}
                  {client.calLink && <div><dt className="text-[var(--muted)]">Cal</dt><dd className="text-[var(--foreground)] truncate">{client.calLink}</dd></div>}
                  {!client.ga4PropertyId && !client.gscSiteUrl && !client.googleAdsCustomerId && !client.notionPageUrl && !client.calLink && (
                    <div className="col-span-2 text-[var(--muted)]">No integrations configured</div>
                  )}
                </dl>
              </section>

              {error && (
                <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-10 py-4 border-t border-[var(--border)] shrink-0 bg-white">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
                disabled={submitting}
                className="px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition"
              >
                ← Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition"
            >
              Cancel
            </button>
            {step === 1 && (
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!step1Valid}
                className="px-4 py-2 text-sm font-semibold text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                Next
              </button>
            )}
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!step2Valid}
                className="px-4 py-2 text-sm font-semibold text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                Next
              </button>
            )}
            {step === 3 && (
              <button
                type="button"
                onClick={() => setStep(4)}
                disabled={!step3Valid}
                className="px-4 py-2 text-sm font-semibold text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                Next
              </button>
            )}
            {step === 4 && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !step1Valid || !step2Valid || !step3Valid}
                className="px-4 py-2 text-sm font-semibold text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                {submitting ? "Converting..." : "Add to Clients"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
