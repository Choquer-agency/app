"use client";

import { useState, useEffect, useCallback } from "react";
import { ClientConfig, TeamMember } from "@/types";
import ClientStatusBadge from "./ClientStatusBadge";

function hasMissingConnections(client: ClientConfig): boolean {
  return !(client.ga4PropertyId && client.gscSiteUrl && client.notionPageUrl && client.calLink);
}

type SortMode = "alphabetical" | "recent" | "specialist";

export default function AdminClientList() {
  const [clients, setClients] = useState<ClientConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrichingSlug, setEnrichingSlug] = useState<string | null>(null);
  const [enrichResult, setEnrichResult] = useState<{ slug: string; message: string; success: boolean } | null>(null);
  const [copiedClientId, setCopiedClientId] = useState<number | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("alphabetical");

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/clients");
      if (res.ok) {
        setClients(await res.json());
      }
    } catch {
      // Failed to fetch
    } finally {
      setLoading(false);
    }
  }, []);

  // Run enrichment for a given slug (used by both manual click and auto-trigger)
  const runEnrichment = useCallback(async (slug: string) => {
    if (enrichingSlug) return;
    setEnrichingSlug(slug);
    setEnrichResult(null);
    try {
      const res = await fetch(`/api/admin/enrich/${slug}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const msg = data.onboarding
          ? "Dashboard ready — strategy pending"
          : `${data.tasks} tasks, ${data.goals} goals synced`;
        setEnrichResult({ slug, message: msg, success: true });
      } else {
        setEnrichResult({ slug, message: data.error || "Sync failed", success: false });
      }
    } catch {
      setEnrichResult({ slug, message: "Sync failed — check your connection", success: false });
    } finally {
      setEnrichingSlug(null);
    }
  }, [enrichingSlug]);

  useEffect(() => {
    fetchClients();
    fetch("/api/admin/team")
      .then((res) => res.ok ? res.json() : [])
      .then(setTeamMembers)
      .catch(() => {});
  }, [fetchClients]);

  // Auto-trigger enrichment when redirected from client creation with ?enrich=slug
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const enrichSlug = params.get("enrich");
    if (enrichSlug) {
      // Clean up the URL so refresh doesn't re-trigger
      window.history.replaceState({}, "", window.location.pathname);
      runEnrichment(enrichSlug);
    }
  }, [runEnrichment]);

  async function handleEnrich(e: React.MouseEvent, client: ClientConfig) {
    e.stopPropagation();
    runEnrichment(client.slug);
  }

  // Filter + sort clients
  const filteredClients = (() => {
    const q = search.toLowerCase().trim();
    let list = q
      ? clients.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.slug.toLowerCase().includes(q) ||
            (c.contactName && c.contactName.toLowerCase().includes(q)) ||
            (c.accountSpecialist && c.accountSpecialist.toLowerCase().includes(q))
        )
      : [...clients];

    switch (sortMode) {
      case "alphabetical":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "recent":
        list.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
        break;
      case "specialist":
        list.sort((a, b) => (a.accountSpecialist ?? "").localeCompare(b.accountSpecialist ?? ""));
        break;
    }
    return list;
  })();

  if (loading) {
    return (
      <div className="text-center py-12 text-[var(--muted)] text-sm">Loading...</div>
    );
  }

  return (
    <>
      {/* Page heading */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[var(--foreground)]">Clients</h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            Manage your agency clients
          </p>
        </div>
        <button
          onClick={() => { window.location.href = '/admin/crm/new'; }}
          className="px-4 py-2 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition"
        >
          + Add Client
        </button>
      </div>

      {/* Search + Sort bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <path strokeLinecap="round" d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent placeholder:text-[var(--muted)]"
          />
        </div>
        <div className="flex items-center gap-1 bg-white border border-[var(--border)] rounded-lg p-0.5">
          {([
            ["alphabetical", "A–Z"],
            ["recent", "Recent"],
            ["specialist", "Specialist"],
          ] as [SortMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                sortMode === mode
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--accent-light)] border-b border-[var(--border)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">
                  Name
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">
                  MRR
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">
                  Specialist
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">
                  Contact
                </th>
                <th className="px-4 py-3 text-right font-medium text-[var(--foreground)]">
                  Dashboard
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-[var(--muted)]"
                  >
                    {clients.length === 0
                      ? 'No clients yet. Click "+ Add Client" to get started.'
                      : "No clients match your search."}
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  <tr
                    key={client.id}
                    onClick={() => {
                      window.location.href = `/admin/crm/${client.id}`;
                    }}
                    className="border-b border-[var(--border)] hover:bg-[var(--accent-light)] cursor-pointer transition"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                      {client.name}
                      <p className="text-xs text-[var(--muted)]">{client.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ClientStatusBadge status={client.clientStatus} />
                        {hasMissingConnections(client) && (
                          <div
                            className="w-1.5 h-1.5 rounded-full bg-red-500"
                            title="Missing integrations"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {client.mrr > 0
                        ? `$${client.mrr.toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {client.accountSpecialist ? (() => {
                        const spec = teamMembers.find((m) => m.name === client.accountSpecialist);
                        return (
                          <div className="flex items-center gap-1.5">
                            {spec?.profilePicUrl ? (
                              <img src={spec.profilePicUrl} alt={spec.name} className="w-5 h-5 rounded-full object-cover" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-[var(--accent-light)] flex items-center justify-center text-[var(--accent)] text-[10px] font-bold">
                                {client.accountSpecialist.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className="text-[var(--foreground)]">{client.accountSpecialist}</span>
                          </div>
                        );
                      })() : <span className="text-[var(--muted)]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)] text-xs group/contact">
                      <div className="flex items-center gap-1">
                        <span>{client.contactName || "—"}</span>
                        {client.contactEmail && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(client.contactEmail);
                              setCopiedClientId(client.id);
                              setTimeout(() => setCopiedClientId(null), 1500);
                            }}
                            className={`shrink-0 p-0.5 rounded transition ${
                              copiedClientId === client.id
                                ? "text-[var(--success-text)] opacity-100"
                                : "text-[var(--muted)] opacity-0 group-hover/contact:opacity-100 hover:text-[var(--foreground)]"
                            }`}
                            title={client.contactEmail}
                          >
                            {copiedClientId === client.id ? (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        {/* Enrichment status */}
                        {enrichingSlug === client.slug && (
                          <span className="text-xs text-[var(--accent)] font-medium animate-pulse">
                            Enriching data...
                          </span>
                        )}
                        {enrichResult?.slug === client.slug && !enrichingSlug && (
                          <span className={`text-xs font-medium ${enrichResult.success ? "text-[var(--success-text)]" : "text-red-500"}`}>
                            {enrichResult.message}
                          </span>
                        )}
                        {/* Refresh / sync enrichment */}
                        <button
                          onClick={(e) => handleEnrich(e, client)}
                          disabled={enrichingSlug === client.slug}
                          title="Sync Notion to dashboard"
                          className={`p-1.5 rounded-lg transition ${
                            enrichingSlug === client.slug
                              ? "opacity-50 cursor-wait"
                              : "hover:bg-gray-100 text-[var(--muted)] hover:text-[var(--accent)]"
                          }`}
                        >
                          <svg
                            className={`w-4 h-4 ${enrichingSlug === client.slug ? "animate-spin-reverse" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                        </button>
                        {/* View dashboard */}
                        <a
                          href={`/${client.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="px-3 py-1 text-xs font-medium text-[var(--accent)] border border-[var(--accent)] rounded-lg hover:bg-[var(--accent-light)] transition"
                        >
                          View Dashboard
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </>
  );
}
