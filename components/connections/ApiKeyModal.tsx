"use client";

import { useState } from "react";
import { PlatformConfig } from "@/types";

interface ApiKeyModalProps {
  platform: PlatformConfig;
  scope: "org" | "client";
  clientId?: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function ApiKeyModal({ platform, scope, clientId, onClose, onSaved }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!apiKey.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: platform.platform,
          scope,
          clientId: clientId || undefined,
          apiKey: apiKey.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to connect");
        return;
      }
      if (data.status === "error") {
        setError(data.lastError || "API key verification failed");
        return;
      }
      onSaved();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
          <h3 className="text-base font-semibold text-[var(--foreground)]">
            Connect {platform.name}
          </h3>
          <p className="text-xs text-[var(--muted)] mt-1">{platform.description}</p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-[var(--foreground)]">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key here"
                className="w-full mt-1 text-sm px-3 py-2 rounded-lg border border-[var(--border)] bg-white focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                autoFocus
              />
            </div>

            <a
              href={platform.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-[var(--accent)] hover:underline"
            >
              How to get your {platform.name} API key
            </a>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="text-xs px-3 py-2 rounded-lg text-[var(--muted)] hover:bg-gray-100 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !apiKey.trim()}
              className="text-xs font-medium px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 transition"
            >
              {submitting ? "Verifying..." : "Connect"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
