"use client";

import { useState, useEffect } from "react";

interface TrackedSite {
  _id: string;
  name: string;
  domain: string;
  siteKey: string;
  active: boolean;
  excludedIps?: string[];
  consentMode?: boolean;
}

export default function VisitorTrackingSettings() {
  const [sites, setSites] = useState<TrackedSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [editingIps, setEditingIps] = useState<string | null>(null);
  const [ipInput, setIpInput] = useState("");

  useEffect(() => {
    fetchSites();
  }, []);

  async function fetchSites() {
    try {
      const res = await fetch("/api/admin/tracked-sites");
      if (res.ok) setSites(await res.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim() || !newDomain.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/tracked-sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), domain: newDomain.trim() }),
      });
      if (res.ok) {
        setShowAddForm(false);
        setNewName("");
        setNewDomain("");
        await fetchSites();
      }
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(site: TrackedSite) {
    try {
      await fetch(`/api/admin/tracked-sites/${site._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !site.active }),
      });
      await fetchSites();
    } catch {
      // silent
    }
  }

  async function handleSaveExcludedIps(siteId: string) {
    const ips = ipInput
      .split(/[\n,]/)
      .map((ip) => ip.trim())
      .filter(Boolean);
    try {
      await fetch(`/api/admin/tracked-sites/${siteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedIps: ips }),
      });
      setEditingIps(null);
      await fetchSites();
    } catch {
      // silent
    }
  }

  function getSnippet(site: TrackedSite): string {
    return `<script defer src="https://insightpulse.vercel.app/t.js" data-site="${site.siteKey}"></script>`;
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[var(--foreground)]">Visitor Identification</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Track website visitors and identify which companies are visiting your site.
          Add the tracking snippet to any website to start collecting data.
        </p>
      </div>

      {/* IPinfo connection status */}
      <div className="mb-6 p-4 rounded-xl border border-[var(--border)] bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">IPinfo API</p>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Required for company identification. Add your API key in Connections.
            </p>
          </div>
          <a
            href="/admin/settings/connections"
            className="text-xs text-[var(--accent)] hover:underline"
          >
            Configure
          </a>
        </div>
      </div>

      {/* Tracked sites list */}
      <div className="space-y-4">
        {sites.map((site) => (
          <div
            key={site._id}
            className="border border-[var(--border)] rounded-xl p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--foreground)]">{site.name}</h3>
                <p className="text-xs text-[var(--muted)]">{site.domain}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${site.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                  {site.active ? "Active" : "Paused"}
                </span>
                <button
                  onClick={() => handleToggleActive(site)}
                  className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition"
                >
                  {site.active ? "Pause" : "Activate"}
                </button>
              </div>
            </div>

            {/* Embed snippet */}
            <div className="mb-3">
              <label className="text-xs text-[var(--muted)] block mb-1">Embed Snippet</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-gray-100 px-3 py-2 rounded-lg font-mono text-[var(--foreground)] overflow-x-auto">
                  {getSnippet(site)}
                </code>
                <button
                  onClick={() => copyToClipboard(getSnippet(site), site._id)}
                  className="shrink-0 px-3 py-2 text-xs border border-[var(--border)] rounded-lg hover:bg-gray-50 transition"
                >
                  {copiedKey === site._id ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Site key */}
            <div className="mb-3">
              <label className="text-xs text-[var(--muted)] block mb-1">Site Key</label>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-gray-100 px-3 py-1.5 rounded-lg font-mono text-[var(--muted)]">
                  {site.siteKey}
                </code>
                <button
                  onClick={() => copyToClipboard(site.siteKey, `key-${site._id}`)}
                  className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  {copiedKey === `key-${site._id}` ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Excluded IPs */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-[var(--muted)]">Excluded IPs</label>
                <button
                  onClick={() => {
                    if (editingIps === site._id) {
                      setEditingIps(null);
                    } else {
                      setEditingIps(site._id);
                      setIpInput((site.excludedIps || []).join("\n"));
                    }
                  }}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  {editingIps === site._id ? "Cancel" : "Edit"}
                </button>
              </div>
              {editingIps === site._id ? (
                <div className="flex gap-2">
                  <textarea
                    value={ipInput}
                    onChange={(e) => setIpInput(e.target.value)}
                    placeholder="One IP per line (e.g., 192.168.1.1)"
                    className="flex-1 text-xs p-2 border border-[var(--border)] rounded-lg font-mono resize-none h-20"
                  />
                  <button
                    onClick={() => handleSaveExcludedIps(site._id)}
                    className="self-end px-3 py-1.5 text-xs bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <p className="text-xs text-[var(--muted)]">
                  {site.excludedIps && site.excludedIps.length > 0
                    ? site.excludedIps.join(", ")
                    : "None — all IPs are tracked"}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add site form */}
      {showAddForm ? (
        <div className="mt-4 border border-[var(--border)] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">Add Tracked Site</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">Site Name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Choquer Agency"
                className="w-full text-sm px-3 py-2 border border-[var(--border)] rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">Domain</label>
              <input
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="e.g., choqueragency.com"
                className="w-full text-sm px-3 py-2 border border-[var(--border)] rounded-lg"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim() || !newDomain.trim()}
                className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewName("");
                  setNewDomain("");
                }}
                className="px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="mt-4 w-full py-3 border border-dashed border-[var(--border)] rounded-xl text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:border-gray-300 transition"
        >
          + Add Tracked Site
        </button>
      )}
    </div>
  );
}
