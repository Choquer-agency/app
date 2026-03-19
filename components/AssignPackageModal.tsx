"use client";

import { useState, useEffect } from "react";
import { Package } from "@/types";

interface AssignPackageModalProps {
  clientId: number;
  packages: Package[];
  onClose: () => void;
  onSaved: () => void;
}

export default function AssignPackageModal({
  clientId,
  packages,
  onClose,
  onSaved,
}: AssignPackageModalProps) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const [packageId, setPackageId] = useState<number | "">(packages[0]?.id || "");
  const [useCustomPrice, setUseCustomPrice] = useState(false);
  const [customPrice, setCustomPrice] = useState("");
  const [useCustomHours, setUseCustomHours] = useState(false);
  const [customHours, setCustomHours] = useState("");
  const [signupDate, setSignupDate] = useState(new Date().toISOString().split("T")[0]);
  const [contractEndDate, setContractEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedPkg = packages.find((p) => p.id === packageId);
  const showHours = selectedPkg && ["seo", "retainer", "google_ads"].includes(selectedPkg.category);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!packageId || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/clients/${clientId}/packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId,
          customPrice: useCustomPrice ? parseFloat(customPrice) || null : null,
          customHours: useCustomHours ? parseFloat(customHours) || null : null,
          signupDate,
          contractEndDate: contractEndDate || null,
          notes,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to assign package");
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full mx-4 max-h-[calc(100vh-100px)] flex flex-col">
        <h2 className="text-lg font-semibold px-8 pt-8 pb-4 shrink-0">
          Assign Package
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto px-8 pb-8">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Package
            </label>
            <select
              value={packageId}
              onChange={(e) => setPackageId(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent bg-white"
            >
              {packages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name} — ${pkg.defaultPrice}/mo
                </option>
              ))}
            </select>
          </div>

          {selectedPkg && (
            <p className="text-xs text-gray-400">
              Default price: ${selectedPkg.defaultPrice}/mo
            </p>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="customPrice"
              checked={useCustomPrice}
              onChange={(e) => setUseCustomPrice(e.target.checked)}
              className="rounded border-gray-300 text-[#FF9500] focus:ring-[#FF9500]"
            />
            <label htmlFor="customPrice" className="text-sm text-gray-700">
              Custom price
            </label>
          </div>

          {useCustomPrice && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Custom Price ($/mo)
              </label>
              <input
                type="number"
                step="0.01"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                placeholder="e.g. 2500"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent"
              />
            </div>
          )}

          {showHours && (
            <>
              {selectedPkg.hoursIncluded && (
                <p className="text-xs text-gray-400">
                  Default hours: {selectedPkg.hoursIncluded}h/mo
                </p>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="customHours"
                  checked={useCustomHours}
                  onChange={(e) => setUseCustomHours(e.target.checked)}
                  className="rounded border-gray-300 text-[#FF9500] focus:ring-[#FF9500]"
                />
                <label htmlFor="customHours" className="text-sm text-gray-700">
                  Custom hours
                </label>
              </div>
              {useCustomHours && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Custom Hours / Month
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={customHours}
                    onChange={(e) => setCustomHours(e.target.value)}
                    placeholder="e.g. 15"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent"
                  />
                </div>
              )}
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sign-up Date
            </label>
            <input
              type="date"
              value={signupDate}
              onChange={(e) => setSignupDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contract End Date
            </label>
            <input
              type="date"
              value={contractEndDate}
              onChange={(e) => setContractEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent"
            />
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
              disabled={!packageId || submitting}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#FF9500] rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {submitting ? "..." : "Assign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
