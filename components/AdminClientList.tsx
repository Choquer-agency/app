"use client";

import { useState, useEffect, useCallback } from "react";
import { ClientConfig, TeamMember } from "@/types";
import ClientFormModal from "./ClientFormModal";
import ClientStatusBadge from "./ClientStatusBadge";

export default function AdminClientList() {
  const [clients, setClients] = useState<ClientConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [enrichingSlug, setEnrichingSlug] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

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

  useEffect(() => {
    fetchClients();
    fetch("/api/admin/team")
      .then((res) => res.ok ? res.json() : [])
      .then(setTeamMembers)
      .catch(() => {});
  }, [fetchClients]);

  function handleSaved() {
    setShowModal(false);
    fetchClients();
  }

  async function handleEnrich(e: React.MouseEvent, client: ClientConfig) {
    e.stopPropagation();
    if (enrichingSlug) return;

    setEnrichingSlug(client.slug);
    try {
      const res = await fetch(`/api/admin/enrich/${client.slug}`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Dashboard updated! ${data.tasks} tasks, ${data.goals} goals synced.`);
      } else {
        const data = await res.json();
        alert(`Sync failed: ${data.error}`);
      }
    } catch {
      alert("Sync failed — check your connection.");
    } finally {
      setEnrichingSlug(null);
    }
  }

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
          onClick={() => setShowModal(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition"
        >
          + Add Client
        </button>
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
              {clients.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-[var(--muted)]"
                  >
                    No clients yet. Click &quot;+ Add Client&quot; to get
                    started.
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr
                    key={client.id}
                    onClick={() => {
                      window.location.href = `/admin/clients/${client.id}`;
                    }}
                    className="border-b border-[var(--border)] hover:bg-[var(--accent-light)] cursor-pointer transition"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                      {client.name}
                      <p className="text-xs text-[var(--muted)]">{client.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <ClientStatusBadge status={client.clientStatus} />
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
                    <td className="px-4 py-3 text-[var(--muted)] text-xs">
                      {client.contactName || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
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
                            className={`w-4 h-4 ${enrichingSlug === client.slug ? "animate-spin" : ""}`}
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

      {showModal && (
        <ClientFormModal
          client={null}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
