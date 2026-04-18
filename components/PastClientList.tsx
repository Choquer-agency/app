"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { docToClient } from "@/lib/clients";
import ClientStatusBadge from "./ClientStatusBadge";

export default function PastClientList() {
  const docs = useQuery(api.clients.getPastClients);
  const clients = useMemo(() => docs?.map(docToClient) ?? [], [docs]);
  const loading = docs === undefined;

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
              <tr className="border-b border-[var(--border)]">
                <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Name</th>
                <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Status</th>
                <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Contact</th>
                <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Industry</th>
                <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Last Updated</th>
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
                    className="border-b border-[var(--border)] hover:bg-[var(--hover-tan)] cursor-pointer transition"
                  >
                    <td className="px-2 py-3 font-medium text-[var(--foreground)]">
                      {client.name}
                      <p className="text-xs text-[var(--muted)]">{client.slug}</p>
                    </td>
                    <td className="px-2 py-3">
                      <ClientStatusBadge status={client.clientStatus} />
                    </td>
                    <td className="px-2 py-3 text-[var(--muted)] text-xs">
                      {client.contactName || "—"}
                    </td>
                    <td className="px-2 py-3 text-[var(--muted)] text-xs">
                      {client.industry || "—"}
                    </td>
                    <td className="px-2 py-3 text-right text-[var(--muted)] text-xs">
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
