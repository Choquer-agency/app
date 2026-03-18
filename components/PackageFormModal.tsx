"use client";

import { useState } from "react";
import { Package } from "@/types";

interface PackageFormModalProps {
  pkg?: Package | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function PackageFormModal({ pkg, onClose, onSaved }: PackageFormModalProps) {
  const isEditing = !!pkg;

  const [name, setName] = useState(pkg?.name || "");
  const [description, setDescription] = useState(pkg?.description || "");
  const [defaultPrice, setDefaultPrice] = useState(pkg?.defaultPrice?.toString() || "");
  const [category, setCategory] = useState<string>(pkg?.category || "other");
  const [hoursIncluded, setHoursIncluded] = useState(pkg?.hoursIncluded?.toString() || "");
  const [servicesText, setServicesText] = useState(
    (pkg?.includedServices || []).join("\n")
  );
  const [active, setActive] = useState(pkg?.active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const showHours = ["seo", "retainer", "google_ads"].includes(category);

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
      hoursIncluded: hoursIncluded ? parseFloat(hoursIncluded) : null,
      includedServices,
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
    "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full mx-4 max-h-[calc(100vh-100px)] flex flex-col">
        <h2 className="text-lg font-semibold px-8 pt-8 pb-4 shrink-0">
          {isEditing ? "Edit Package" : "Add Package"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto px-8 pb-8">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Price ($/mo)
            </label>
            <input
              type="number"
              step="0.01"
              value={defaultPrice}
              onChange={(e) => setDefaultPrice(e.target.value)}
              placeholder="e.g. 2000"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`${inputClass} bg-white`}
            >
              <option value="seo">SEO</option>
              <option value="retainer">Retainer</option>
              <option value="google_ads">Google Ads</option>
              <option value="blog">Blog</option>
              <option value="website">Website</option>
              <option value="other">Other</option>
            </select>
          </div>

          {showHours && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
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

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="pkgActive"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="rounded border-gray-300 text-[#FF9500] focus:ring-[#FF9500]"
            />
            <label htmlFor="pkgActive" className="text-sm text-gray-700">
              Active
            </label>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#FF9500] rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {submitting ? "..." : isEditing ? "Save Changes" : "Add Package"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
