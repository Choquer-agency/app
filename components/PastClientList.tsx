"use client";

import { useState, useEffect, useCallback } from "react";
import { ClientConfig } from "@/types";
import ClientStatusBadge from "./ClientStatusBadge";

export default function PastClientList() {
  const [clients, setClients] = useState<ClientConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/clients?past=true");
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
  }, [fetchClients]);

  if (loading) {
    return (
      <div className="text-center py-12 text-[var(--muted)] text-sm">Loading...</div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[var(--foreground)]">Past Clients</h2>
        <p className="text-sm text-[var(--muted)] mt-1">
          Clients that have been deactivated or completed offboarding
        </p>
      </div>

      <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--accent-light)] border-b border-[var(--border)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Name</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Status</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Contact</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Industry</th>
                <th className="px-4 py-3 text-right font-medium text-[var(--foreground)]">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-[var(--muted)]"
                  >
                    No past clients.
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
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
                      <ClientStatusBadge status={client.clientStatus} />
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)] text-xs">
                      {client.contactName || "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)] text-xs">
                      {client.industry || "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--muted)] text-xs">
                      {client.updatedAt
                        ? new Date(client.updatedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
