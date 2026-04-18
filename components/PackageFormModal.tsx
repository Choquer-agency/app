"use client";

import { useState, useEffect } from "react";
import { Package, BillingFrequency } from "@/types";
import FilterDropdown from "./FilterDropdown";

interface PackageFormModalProps {
  pkg?: Package | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function PackageFormModal({ pkg, onClose, onSaved }: PackageFormModalProps) {
  const isEditing = !!pkg;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const [name, setName] = useState(pkg?.name || "");
  const [description, setDescription] = useState(pkg?.description || "");
  const [defaultPrice, setDefaultPrice] = useState(pkg?.defaultPrice?.toString() || "");
  const [category, setCategory] = useState<string>(pkg?.category || "other");
  const [billingFrequency, setBillingFrequency] = useState<BillingFrequency>(
    pkg?.billingFrequency || "monthly"
  );
  const [setupFee, setSetupFee] = useState(pkg?.setupFee?.toString() || "0");
  const [hoursIncluded, setHoursIncluded] = useState(pkg?.hoursIncluded?.toString() || "");
  const [servicesText, setServicesText] = useState(
    (pkg?.includedServices || []).join("\n")
  );
  const [active, setActive] = useState(pkg?.active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const showHours = ["seo", "retainer", "google_ads", "social_media_ads"].includes(category);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    setError("");

    const includedServices = servicesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const body = {
      name: name.trim(),
      description,
      defaultPrice: parseFloat(defaultPrice) || 0,
      category,
      billingFrequency,
      hoursIncluded: hoursIncluded ? parseFloat(hoursIncluded) : null,
      includedServices,
      setupFee: parseFloat(setupFee) || 0,
      active,
    };

    try {
      const url = isEditing
        ? `/api/admin/packages/${pkg!.id}`
        : "/api/admin/packages";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

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

  const inputClass =
    "w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full mx-4 max-h-[calc(100vh-100px)] flex flex-col">
        <h2 className="text-lg font-semibold px-8 pt-8 pb-4 shrink-0">
          {isEditing ? "Edit Package" : "Add Package"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto px-8 pb-8">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              Package Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. SEO Growth"
              autoFocus
              required
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's included in this package..."
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              Default Price
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] text-sm pointer-events-none select-none">
                $
              </div>
              <input
                type="number"
                step="0.01"
                value={defaultPrice}
                onChange={(e) => setDefaultPrice(e.target.value)}
                placeholder="2000"
                className="w-full pl-7 pr-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              Default Setup Fee
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] text-sm pointer-events-none select-none">
                $
              </div>
              <input
                type="number"
                step="0.01"
                value={setupFee}
                onChange={(e) => setSetupFee(e.target.value)}
                placeholder="0"
                className="w-full pl-7 pr-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
              />
            </div>
            <p className="text-xs text-[var(--muted)] mt-1">One-time fee charged at signup (0 = none)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              Category
            </label>
            <FilterDropdown
              label=""
              value={category}
              onChange={(v) => setCategory(v)}
              options={[
                { value: "seo", label: "SEO" },
                { value: "retainer", label: "Retainer" },
                { value: "google_ads", label: "Google Ads" },
                { value: "social_media_ads", label: "Social Media Ads" },
                { value: "blog", label: "Blog" },
                { value: "website", label: "Website" },
                { value: "other", label: "Other" },
              ]}
              fullWidth
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              Billing Frequency
            </label>
            <FilterDropdown
              label=""
              value={billingFrequency}
              onChange={(v) => setBillingFrequency(v as BillingFrequency)}
              options={[
                { value: "one_time", label: "One-Time" },
                { value: "weekly", label: "Weekly" },
                { value: "bi_weekly", label: "Bi-Weekly" },
                { value: "monthly", label: "Monthly" },
                { value: "quarterly", label: "Quarterly" },
                { value: "annually", label: "Annually" },
              ]}
              fullWidth
            />
          </div>

          {showHours && (
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Hours Included
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={hoursIncluded}
                onChange={(e) => setHoursIncluded(e.target.value)}
                placeholder="e.g. 10"
                className={inputClass}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              Included Services (one per line)
            </label>
            <textarea
              value={servicesText}
              onChange={(e) => setServicesText(e.target.value)}
              placeholder={"On-page SEO\nContent creation\nMonthly reporting"}
              rows={5}
              className={`${inputClass} resize-none`}
            />
          </div>

          {isEditing && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="pkgActive"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="rounded border-gray-300 text-[var(--accent)] focus:ring-[var(--accent)]"
              />
              <label htmlFor="pkgActive" className="text-sm text-[var(--foreground)]">
                Active
              </label>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-[var(--foreground)] bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {submitting ? "..." : isEditing ? "Save Changes" : "Add Package"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
