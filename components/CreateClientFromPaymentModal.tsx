"use client";

import { useState, useEffect, useRef } from "react";
import FilterDropdown from "./FilterDropdown";

interface TransactionData {
  txnId: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  description: string | null;
  amount: number;
  terminal: "USD" | "CAD";
  recurringId: string | null;
  cardLastFour: string | null;
  cardExpiryMonth: number | null;
  cardExpiryYear: number | null;
}

interface CrmClient {
  _id: string;
  id: string;
  name: string;
  contactName?: string;
  contactEmail?: string;
  country?: string;
}

interface Package {
  _id: string;
  name: string;
  defaultPrice: number;
  category?: string;
  billingFrequency?: string;
}

interface Props {
  transaction: TransactionData;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateClientFromPaymentModal({
  transaction,
  onClose,
  onCreated,
}: Props) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Selected existing client (null = creating new)
  const [selectedClient, setSelectedClient] = useState<CrmClient | null>(null);

  // Company name input + autocomplete
  const contactName = [transaction.firstName, transaction.lastName]
    .filter(Boolean)
    .join(" ");
  const guessedCompany =
    transaction.company ||
    (transaction.description?.includes(" - ")
      ? transaction.description.split(" - ")[0]
      : "");

  const [companyInput, setCompanyInput] = useState(guessedCompany);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [contact, setContact] = useState(contactName);
  const [contactEmail, setContactEmail] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [customPrice, setCustomPrice] = useState(String(transaction.amount));
  const [label, setLabel] = useState(
    transaction.description?.replace(/^DECLINED:\s*\w+\s*\|\s*/i, "") || ""
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Load clients and packages
  useEffect(() => {
    fetch("/api/admin/clients")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .catch(() => {});

    fetch("/api/admin/packages")
      .then((r) => (r.ok ? r.json() : []))
      .then((pkgs) =>
        setPackages(
          (pkgs as Package[]).filter((p: any) => p.active !== false)
        )
      )
      .catch(() => {});
  }, []);

  // Auto-match package by amount
  useEffect(() => {
    if (packages.length > 0 && !selectedPackageId) {
      const match = packages.find(
        (p) => p.defaultPrice === transaction.amount
      );
      if (match) setSelectedPackageId(match._id);
    }
  }, [packages, transaction.amount, selectedPackageId]);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Filter clients by input
  const suggestions =
    companyInput.length >= 2
      ? clients
          .filter((c) =>
            c.name.toLowerCase().includes(companyInput.toLowerCase())
          )
          .slice(0, 5)
      : [];

  function handleSelectClient(client: CrmClient) {
    setSelectedClient(client);
    setCompanyInput(client.name);
    setShowSuggestions(false);
    if (client.contactName) setContact(client.contactName);
    if (client.contactEmail) setContactEmail(client.contactEmail);
  }

  function handleCompanyInputChange(val: string) {
    setCompanyInput(val);
    setSelectedClient(null); // Clear selection when typing
    setShowSuggestions(true);
  }

  const isExistingClient = selectedClient !== null;
  const selectedPackage = packages.find((p) => p._id === selectedPackageId);
  const priceOverride =
    selectedPackage && parseFloat(customPrice) !== selectedPackage.defaultPrice
      ? parseFloat(customPrice)
      : undefined;

  async function handleSubmit() {
    if (!companyInput.trim() || !selectedPackageId) return;
    setSubmitting(true);

    try {
      let clientId: string;

      if (isExistingClient) {
        // Link to existing client
        clientId = selectedClient._id || selectedClient.id;
      } else {
        // Create new client
        const clientRes = await fetch("/api/admin/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: companyInput.trim(),
            contactName: contact.trim() || undefined,
            contactEmail: contactEmail.trim() || undefined,
            country: transaction.terminal === "CAD" ? "CA" : "US",
            clientStatus: "active",
          }),
        });

        if (!clientRes.ok) throw new Error("Failed to create client");
        const client = await clientRes.json();
        clientId = client._id || client.id;
      }

      // Assign package (for both new and existing clients)
      await fetch(`/api/admin/clients/${clientId}/packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: selectedPackageId,
          customPrice: priceOverride,
        }),
      });

      // Link Converge profile
      if (transaction.recurringId) {
        await fetch("/api/admin/converge-profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            recurringId: transaction.recurringId,
            label: label.trim() || undefined,
            currency: transaction.terminal,
          }),
        });
      }

      // Notify accountant (only for new clients)
      if (!isExistingClient) {
        await fetch("/api/admin/payments/notify-accountant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientName: companyInput.trim(),
            contactName: contact.trim(),
            contactEmail: contactEmail.trim(),
            packageName: selectedPackage?.name,
            amount: parseFloat(customPrice),
            currency: transaction.terminal,
            billingFrequency: selectedPackage?.billingFrequency || "monthly",
            country:
              transaction.terminal === "CAD" ? "Canada" : "United States",
          }),
        });
      }

      onCreated();
    } catch (err) {
      console.error("Error linking payment:", err);
    }
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold text-lg text-[var(--foreground)] mb-1">
          {isExistingClient ? "Link to Existing Client" : "New Client from Payment"}
        </h3>
        <p className="text-xs text-[var(--muted)] mb-5">
          {transaction.terminal} transaction for ${transaction.amount} —{" "}
          {transaction.description || "No description"}
        </p>

        <div className="space-y-4">
          {/* Company Name with Autocomplete */}
          <div className="relative">
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              Company Name *
            </label>
            <input
              ref={inputRef}
              type="text"
              value={companyInput}
              onChange={(e) => handleCompanyInputChange(e.target.value)}
              onFocus={() => companyInput.length >= 2 && setShowSuggestions(true)}
              className={`w-full border rounded-lg p-3 text-sm ${
                isExistingClient
                  ? "border-green-300 bg-green-50"
                  : "border-gray-200"
              }`}
              placeholder="Start typing to search existing clients..."
            />
            {isExistingClient && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                  Existing client
                </span>
                <button
                  onClick={() => {
                    setSelectedClient(null);
                    setCompanyInput("");
                    inputRef.current?.focus();
                  }}
                  className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Clear
                </button>
              </div>
            )}
            {!isExistingClient && companyInput.length >= 2 && (
              <p className="text-xs text-[var(--muted)] mt-1">
                {suggestions.length > 0
                  ? "Select a client below, or keep typing to create a new one"
                  : "No matching clients — a new client will be created"}
              </p>
            )}

            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && !isExistingClient && (
              <div
                ref={suggestionsRef}
                className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
              >
                {suggestions.map((client) => (
                  <button
                    key={client._id}
                    onClick={() => handleSelectClient(client)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition border-b border-gray-50 last:border-0"
                  >
                    <span className="font-medium text-sm text-[var(--foreground)]">
                      {client.name}
                    </span>
                    {client.contactName && (
                      <span className="text-xs text-[var(--muted)] ml-2">
                        {client.contactName}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Contact Name + Email (hidden for existing clients since they already have this) */}
          {!isExistingClient && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm"
                  placeholder="Primary contact"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm"
                  placeholder="email@company.com"
                />
              </div>
            </div>
          )}

          {/* Package */}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              Package *
            </label>
            <FilterDropdown
              label=""
              value={selectedPackageId}
              onChange={(v) => {
                setSelectedPackageId(v);
                const pkg = packages.find((p) => p._id === v);
                if (pkg) setCustomPrice(String(pkg.defaultPrice));
              }}
              options={[
                { value: "", label: "Select a package..." },
                ...packages.map((p) => ({
                  value: p._id,
                  label: `${p.name} — $${p.defaultPrice}${
                    p.billingFrequency
                      ? `/${p.billingFrequency === "monthly" ? "mo" : p.billingFrequency === "annually" ? "yr" : p.billingFrequency}`
                      : ""
                  }`,
                })),
              ]}
              fullWidth
            />
          </div>

          {/* Custom Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Price
                {priceOverride !== undefined && (
                  <span className="text-xs text-amber-600 ml-1">(custom)</span>
                )}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-sm text-[var(--muted)]">
                  $
                </span>
                <input
                  type="number"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-3 pl-7 text-sm"
                  step="0.01"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Currency
              </label>
              <div className="border border-gray-200 rounded-lg p-3 text-sm bg-gray-50 text-[var(--muted)]">
                {transaction.terminal === "CAD"
                  ? "CAD (Canadian)"
                  : "USD (US Dollar)"}
              </div>
            </div>
          </div>

          {/* Converge Label */}
          {transaction.recurringId && (
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Converge Profile Label
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full border border-gray-200 rounded-lg p-3 text-sm"
                placeholder="e.g. SEO Monthly"
              />
              <p className="text-xs text-[var(--muted)] mt-1">
                Recurring ID: {transaction.recurringId}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !companyInput.trim() || !selectedPackageId}
            className="px-5 py-2 text-sm bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          >
            {submitting
              ? isExistingClient
                ? "Linking..."
                : "Creating..."
              : isExistingClient
                ? "Link to Client"
                : "Create Client & Notify Accountant"}
          </button>
        </div>
      </div>
    </div>
  );
}
