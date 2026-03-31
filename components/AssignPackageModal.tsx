"use client";

import { useState, useEffect } from "react";
import { Package } from "@/types";

interface AssignPackageModalProps {
  clientId: number;
  clientCountry?: "CA" | "US";
  packages: Package[];
  onClose: () => void;
  onSaved: () => void;
}

export default function AssignPackageModal({
  clientId,
  clientCountry = "US",
  packages,
  onClose,
  onSaved,
}: AssignPackageModalProps) {
  const currency = clientCountry === "CA" ? "CAD" : "USD";
  const currencySymbol = "$";

  function formatPrice(val: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  }
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  function getDefaultContractTerm(category: string): "month_to_month" | "3_months" | "6_months" | "1_year" | "custom" {
    if (category === "google_ads" || category === "social_media_ads") return "3_months";
    if (category === "seo") return "6_months";
    return "month_to_month";
  }

  const [packageId, setPackageId] = useState<string>(packages[0]?.id ? String(packages[0].id) : "");
  const [useCustomPrice, setUseCustomPrice] = useState(false);
  const [customPrice, setCustomPrice] = useState("");
  const [useCustomHours, setUseCustomHours] = useState(false);
  const [customHours, setCustomHours] = useState("");
  const [applySetupFee, setApplySetupFee] = useState(false);
  const [useCustomSetupFee, setUseCustomSetupFee] = useState(false);
  const [customSetupFee, setCustomSetupFee] = useState("");
  const [signupDate, setSignupDate] = useState(new Date().toISOString().split("T")[0]);
  const [contractTerm, setContractTerm] = useState<"month_to_month" | "3_months" | "6_months" | "1_year" | "custom">(
    getDefaultContractTerm(packages[0]?.category || "other")
  );
  const [customEndDate, setCustomEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedPkg = packages.find((p) => String(p.id) === packageId);
  const showHours = !!selectedPkg;
  const hasSetupFee = selectedPkg && selectedPkg.setupFee > 0;

  function computeEndDate(): string | null {
    if (contractTerm === "month_to_month") return null;
    if (contractTerm === "custom") return customEndDate || null;

    const start = new Date(signupDate);
    const monthsMap = { "3_months": 3, "6_months": 6, "1_year": 12 } as const;
    start.setMonth(start.getMonth() + monthsMap[contractTerm]);
    return start.toISOString().split("T")[0];
  }

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
          customHours: useCustomHours
            ? customHours.trim() === "" ? null : parseFloat(customHours)
            : null,
          applySetupFee,
          customSetupFee: applySetupFee && useCustomSetupFee ? parseFloat(customSetupFee) || null : null,
          signupDate,
          contractEndDate: computeEndDate(),
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
              onChange={(e) => {
                const newId = e.target.value;
                setPackageId(newId);
                const pkg = packages.find((p) => String(p.id) === newId);
                if (pkg) setContractTerm(getDefaultContractTerm(pkg.category));
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent bg-white"
            >
              {packages.map((pkg) => (
                <option key={String(pkg.id)} value={String(pkg.id)}>
                  {pkg.name} — {formatPrice(pkg.defaultPrice)}/mo {currency}
                </option>
              ))}
            </select>
          </div>

          {selectedPkg && (
            <p className="text-xs text-gray-400">
              Default price: {formatPrice(selectedPkg.defaultPrice)}/mo {currency}
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
                Custom Price ({currency}/mo)
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none select-none">
                  {currencySymbol}
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="e.g. 2500"
                  className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent"
                />
              </div>
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
                    placeholder="Leave blank for unlimited"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Blank = unlimited (not tracked) · 0 = no hours · Any number = monthly cap
                  </p>
                </div>
              )}
            </>
          )}

          {hasSetupFee && (
            <div className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="applySetupFee"
                  checked={applySetupFee}
                  onChange={(e) => setApplySetupFee(e.target.checked)}
                  className="rounded border-gray-300 text-[#FF9500] focus:ring-[#FF9500]"
                />
                <label htmlFor="applySetupFee" className="text-sm text-gray-700">
                  Apply setup fee
                </label>
                <span className="text-xs text-gray-400 ml-auto">
                  Default: {formatPrice(selectedPkg.setupFee)} {currency}
                </span>
              </div>
              {applySetupFee && (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="customSetupFee"
                      checked={useCustomSetupFee}
                      onChange={(e) => setUseCustomSetupFee(e.target.checked)}
                      className="rounded border-gray-300 text-[#FF9500] focus:ring-[#FF9500]"
                    />
                    <label htmlFor="customSetupFee" className="text-xs text-gray-600">
                      Custom setup fee amount
                    </label>
                  </div>
                  {useCustomSetupFee && (
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none select-none">
                        {currencySymbol}
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        value={customSetupFee}
                        onChange={(e) => setCustomSetupFee(e.target.value)}
                        placeholder={`${selectedPkg.setupFee}`}
                        className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
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
              Contract Term
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "month_to_month", label: "Month-to-month" },
                { value: "3_months", label: "3 Months" },
                { value: "6_months", label: "6 Months" },
                { value: "1_year", label: "1 Year" },
                { value: "custom", label: "Custom" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setContractTerm(opt.value)}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition ${
                    contractTerm === opt.value
                      ? "border-[#FF9500] bg-[#FF9500]/10 text-[#FF9500]"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {contractTerm === "custom" && (
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full mt-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent"
              />
            )}
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
