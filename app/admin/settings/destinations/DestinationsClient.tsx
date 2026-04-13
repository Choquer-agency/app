"use client";

import { useEffect, useState } from "react";

interface Destination {
  _id: string;
  type: string;
  name: string;
  connectionId: string;
  status: string;
  lastTestedAt?: string;
  lastError?: string;
  _creationTime: number;
}

interface Connection {
  id: string;
  platform: string;
  scope: string;
  status: string;
  displayName?: string;
}

const TYPE_LABELS: Record<string, string> = {
  notion: "Notion database",
  sheets: "Google Sheets",
  bigquery: "BigQuery table",
};

const TYPE_BADGES: Record<string, string> = {
  notion: "bg-slate-100 text-slate-800",
  sheets: "bg-green-100 text-green-800",
  bigquery: "bg-blue-100 text-blue-800",
};

export default function DestinationsClient() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const load = async () => {
    const [dRes, cRes] = await Promise.all([
      fetch("/api/admin/destinations"),
      fetch("/api/admin/connections"),
    ]);
    if (dRes.ok) setDestinations((await dRes.json()).destinations);
    if (cRes.ok) {
      const body = await cRes.json();
      // API returns a raw array of ApiConnection objects
      setConnections(Array.isArray(body) ? body : []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const runTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await fetch(`/api/admin/destinations/${id}/test`, { method: "POST" });
      const body = await res.json();
      if (!body.ok) alert(`Test failed: ${body.error}`);
      else alert("Test OK — destination is reachable.");
      await load();
    } finally {
      setTestingId(null);
    }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this destination? Any syncs using it must be deleted first.")) return;
    const res = await fetch(`/api/admin/destinations/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "Failed to delete");
    }
    await load();
  };

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Destinations</h1>
          <p className="text-sm text-gray-600 mt-1">
            Where scheduled syncs deliver data. Notion databases, Google Sheets, or
            BigQuery tables you already own.
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium"
        >
          Add destination
        </button>
      </header>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : destinations.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-lg p-12 text-center">
          <div className="text-gray-500 text-sm">No destinations yet.</div>
          <button
            onClick={() => setAddOpen(true)}
            className="mt-3 text-sm text-indigo-600 hover:text-indigo-800"
          >
            Add your first →
          </button>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
          {destinations.map((d) => (
            <div key={d._id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs px-2 py-1 rounded font-mono ${
                    TYPE_BADGES[d.type] || "bg-gray-100 text-gray-800"
                  }`}
                >
                  {TYPE_LABELS[d.type] || d.type}
                </span>
                <div>
                  <div className="font-medium text-gray-900">{d.name}</div>
                  <div className="text-xs text-gray-500">
                    {d.status === "active" ? (
                      <span className="text-green-700">Active</span>
                    ) : d.status === "error" ? (
                      <span className="text-red-600">Error: {d.lastError}</span>
                    ) : (
                      <span>{d.status}</span>
                    )}
                    {d.lastTestedAt && ` · tested ${formatRelative(d.lastTestedAt)}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => runTest(d._id)}
                  disabled={testingId === d._id}
                  className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  {testingId === d._id ? "Testing…" : "Test"}
                </button>
                <button
                  onClick={() => del(d._id)}
                  className="text-xs px-3 py-1.5 border border-red-300 text-red-700 rounded hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <AddDestinationModal
          connections={connections}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddDestinationModal({
  connections,
  onClose,
  onCreated,
}: {
  connections: Connection[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState<"notion" | "sheets" | "bigquery">("notion");
  const [name, setName] = useState("");
  const [connectionId, setConnectionId] = useState("");
  // Notion
  const [databaseId, setDatabaseId] = useState("");
  // Sheets
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetName, setSheetName] = useState("Sheet1");
  const [writeMode, setWriteMode] = useState<"replace" | "append">("replace");
  // BigQuery
  const [projectId, setProjectId] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [tableId, setTableId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const compatibleConnections = connections.filter((c) => {
    if (type === "notion") return c.platform === "notion" && c.status === "active";
    return (c.platform === "google_oauth" || c.platform.startsWith("google")) && c.status === "active";
  });

  const submit = async () => {
    if (!name || !connectionId) {
      alert("Name and connection are required.");
      return;
    }
    let config: Record<string, unknown>;
    if (type === "notion") {
      if (!databaseId) return alert("Notion database ID required");
      config = { databaseId };
    } else if (type === "sheets") {
      if (!spreadsheetId) return alert("Spreadsheet ID required");
      config = { spreadsheetId, sheetName, writeMode };
    } else {
      if (!projectId || !datasetId || !tableId) return alert("projectId/datasetId/tableId required");
      config = { projectId, datasetId, tableId, writeMode };
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/destinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, name, connectionId, config }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error || "Failed to create");
      } else {
        onCreated();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">Add destination</h2>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700">Type</label>
          <div className="flex gap-2">
            {(["notion", "sheets", "bigquery"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-3 py-2 text-sm border rounded ${
                  type === t
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                    : "border-gray-300 text-gray-700"
                }`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Penni Cart Reporting Sheet"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700">
            Connection (from /admin/settings/connections)
          </label>
          <select
            value={connectionId}
            onChange={(e) => setConnectionId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          >
            <option value="">— pick a connection —</option>
            {compatibleConnections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.platform} · {c.displayName || c.scope}
              </option>
            ))}
          </select>
          {compatibleConnections.length === 0 && (
            <p className="text-xs text-red-600 mt-1">
              No compatible connections. Connect {type === "notion" ? "Notion" : "Google"} at{" "}
              <a href="/admin/settings/connections" className="underline">
                Settings → Connections
              </a>
              .
            </p>
          )}
        </div>

        {type === "notion" && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Notion database ID</label>
            <input
              value={databaseId}
              onChange={(e) => setDatabaseId(e.target.value)}
              placeholder="paste database ID from Notion URL"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded font-mono"
            />
            <p className="text-xs text-gray-500">
              Open the database in Notion → Share → copy the ID from the URL. Share the
              database with the Choquer integration too.
            </p>
          </div>
        )}

        {type === "sheets" && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Spreadsheet ID</label>
              <input
                value={spreadsheetId}
                onChange={(e) => setSpreadsheetId(e.target.value)}
                placeholder="paste from sheets URL"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Sheet name</label>
                <input
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Write mode</label>
                <select
                  value={writeMode}
                  onChange={(e) => setWriteMode(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
                >
                  <option value="replace">Replace each run</option>
                  <option value="append">Append</option>
                </select>
              </div>
            </div>
          </>
        )}

        {type === "bigquery" && (
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Project ID</label>
              <input
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Dataset</label>
              <input
                value={datasetId}
                onChange={(e) => setDatasetId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Table</label>
              <input
                value={tableId}
                onChange={(e) => setTableId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Add destination"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
