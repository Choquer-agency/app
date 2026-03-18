"use client";

import { useState, useEffect, useCallback } from "react";
import { ClientConfig } from "@/types";
import ClientFormModal from "./ClientFormModal";

export default function AdminClientList() {
  const [clients, setClients] = useState<ClientConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientConfig | null>(null);

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
  }, [fetchClients]);

  function handleAdd() {
    setEditingClient(null);
    setShowModal(true);
  }

  function handleEdit(client: ClientConfig) {
    setEditingClient(client);
    setShowModal(true);
  }

  async function handleDeactivate(client: ClientConfig) {
    if (!confirm(`Deactivate ${client.name}?`)) return;
    try {
      await fetch(`/api/admin/clients/${client.id}`, { method: "DELETE" });
      fetchClients();
    } catch {
      // Failed
    }
  }

  async function handleReactivate(client: ClientConfig) {
    try {
      await fetch(`/api/admin/clients/${client.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
      fetchClients();
    } catch {
      // Failed
    }
  }

  function handleSaved() {
    setShowModal(false);
    setEditingClient(null);
    fetchClients();
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Clients</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {clients.length} client{clients.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={handleAdd}
            className="px-4 py-2 text-sm font-medium text-white bg-[#FF9500] rounded-lg hover:opacity-90 transition"
          >
            + Add Client
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-medium text-gray-400">
                  Name
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">
                  Slug
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">
                  GA4
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">
                  GSC
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">
                  Notion
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    No clients yet. Click &quot;+ Add Client&quot; to get
                    started.
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr
                    key={client.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium">
                      <a
                        href={`/${client.slug}`}
                        className="text-[#FF9500] hover:underline"
                      >
                        {client.name}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{client.slug}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {client.ga4PropertyId
                        ? client.ga4PropertyId.replace("properties/", "")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-[150px] truncate">
                      {client.gscSiteUrl || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {client.notionPageUrl ? (
                        <a
                          href={client.notionPageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#FF9500] hover:underline text-xs"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {client.active ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                          Active
                        </span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(client)}
                          className="text-xs text-gray-500 hover:text-gray-800"
                        >
                          Edit
                        </button>
                        {client.active ? (
                          <button
                            onClick={() => handleDeactivate(client)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(client)}
                            className="text-xs text-green-600 hover:text-green-800"
                          >
                            Reactivate
                          </button>
                        )}
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
          client={editingClient}
          onClose={() => {
            setShowModal(false);
            setEditingClient(null);
          }}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
