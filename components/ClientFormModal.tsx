"use client";

import { useState, useEffect, useCallback } from "react";
import { ClientConfig, CreateClientInput } from "@/types";

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

const BOOKING_OPTIONS = [
  {
    label: "Andreas - 15min",
    value: "https://cal.com/andres-agudelo-hqlknm/15min",
  },
];

export default function ClientFormModal({
  client,
  onClose,
  onSaved,
}: ClientFormModalProps) {
  const isEditing = !!client;

  const [name, setName] = useState(client?.name || "");
  const [notionPageUrl, setNotionPageUrl] = useState(
    client?.notionPageUrl || ""
  );
  const [ga4PropertyId, setGa4PropertyId] = useState(
    client?.ga4PropertyId?.replace("properties/", "") || ""
  );
  const [gscSiteUrl, setGscSiteUrl] = useState(
    client?.gscSiteUrl?.replace("sc-domain:", "") || ""
  );
  const [calLink, setCalLink] = useState(
    client?.calLink || BOOKING_OPTIONS[0].value
  );
  const [customCalLink, setCustomCalLink] = useState("");
  const [isCustomBooking, setIsCustomBooking] = useState(false);
  const [active, setActive] = useState(client?.active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (
      client?.calLink &&
      !BOOKING_OPTIONS.some((o) => o.value === client.calLink)
    ) {
      setIsCustomBooking(true);
      setCustomCalLink(client.calLink);
    }
  }, [client]);

  const slug = generateSlug(name);
  const notionPageId = extractNotionPageId(notionPageUrl);

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
    };

    try {
      const url = isEditing
        ? `/api/admin/clients/${client!.id}`
        : "/api/admin/clients";
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm overflow-hidden">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full mx-4 my-[50px] max-h-[calc(100vh-100px)] flex flex-col">
        <h2 className="text-lg font-semibold px-8 pt-8 pb-6 shrink-0">
          {isEditing ? "Edit Client" : "Add Client"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto px-8 pb-8">
          {/* Business Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Century Plaza"
              autoFocus
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent"
            />
            {slug && (
              <p className="text-xs text-gray-400 mt-1">
                Dashboard URL: /{slug}
              </p>
            )}
          </div>

          {/* Notion Page URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notion Page URL
            </label>
            <input
              type="url"
              value={notionPageUrl}
              onChange={(e) => setNotionPageUrl(e.target.value)}
              placeholder="https://www.notion.so/..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent"
            />
            {notionPageId && (
              <p className="text-xs text-gray-400 mt-1">
                Page ID: {notionPageId}
              </p>
            )}
          </div>

          {/* GA4 Property ID */}
          <div>
            <div className="flex items-center mb-1">
              <label className="text-sm font-medium text-gray-700">
                GA4 Property ID
              </label>
              <CopyServiceAccountButton />
            </div>
            <input
              type="text"
              value={ga4PropertyId}
              onChange={(e) => setGa4PropertyId(e.target.value)}
              placeholder="e.g. 123456789"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent"
            />
          </div>

          {/* Search Console URL */}
          <div>
            <div className="flex items-center mb-1">
              <label className="text-sm font-medium text-gray-700">
                Search Console URL
              </label>
              <CopyServiceAccountButton />
            </div>
            <input
              type="text"
              value={gscSiteUrl}
              onChange={(e) => setGscSiteUrl(e.target.value)}
              placeholder="e.g. example.com"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent"
            />
          </div>

          {/* Booking Link */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Booking Link
            </label>
            <select
              value={isCustomBooking ? "__custom__" : calLink}
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  setIsCustomBooking(true);
                } else {
                  setIsCustomBooking(false);
                  setCalLink(e.target.value);
                }
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent bg-white"
            >
              {BOOKING_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              <option value="__custom__">Custom</option>
            </select>
            {isCustomBooking && (
              <input
                type="url"
                value={customCalLink}
                onChange={(e) => setCustomCalLink(e.target.value)}
                placeholder="https://cal.com/..."
                className="w-full mt-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-transparent"
              />
            )}
          </div>

          {/* Active */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="rounded border-gray-300 text-[#FF9500] focus:ring-[#FF9500]"
            />
            <label htmlFor="active" className="text-sm text-gray-700">
              Active
            </label>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
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
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#FF9500] rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? "..."
                : isEditing
                  ? "Save Changes"
                  : "Add Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
