"use client";

import { useEffect, useState } from "react";
import FilterDropdown from "@/components/FilterDropdown";

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
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Destinations</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Where scheduled syncs deliver data. Notion databases, Google Sheets, or
            BigQuery tables you already own.
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition"
        >
          + Add destination
        </button>
      </header>

      {loading ? (
        <div className="text-sm text-[var(--muted)]">Loading…</div>
      ) : destinations.length === 0 ? (
        <div className="border border-dashed border-[var(--border)] rounded-xl p-12 text-center">
          <div className="text-sm text-[var(--muted)]">No destinations yet.</div>
          <button
            onClick={() => setAddOpen(true)}
            className="mt-3 text-sm font-medium text-[var(--accent)] hover:opacity-80"
          >
            Add your first →
          </button>
        </div>
      ) : (
        <div className="border border-[var(--border)] rounded-xl bg-white divide-y divide-[var(--border)]">
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

  const inputClass =
    "w-full px-3 py-2 text-sm bg-white border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)]";
  const labelClass = "block text-xs font-medium text-[var(--muted)] mb-1.5";

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden"
        style={{ maxHeight: "calc(90vh / 1.1875)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 pt-6 pb-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-bold text-[var(--foreground)]">Add Destination</h2>
          <p className="text-xs text-[var(--muted)] mt-1">
            Where scheduled syncs deliver data.
          </p>
        </div>

        <div className="px-8 py-5 space-y-5 overflow-y-auto">
          <div>
            <label className={labelClass}>Type</label>
            <div className="flex gap-2">
              {(["notion", "sheets", "bigquery"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium border rounded-lg transition ${
                    type === t
                      ? "border-[var(--accent)] bg-[#FFEFDE] text-[var(--accent)]"
                      : "border-[var(--border)] bg-white text-[var(--foreground)] hover:bg-[var(--hover-tan)]"
                  }`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Penni Cart Reporting Sheet"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Connection</label>
            {compatibleConnections.length === 0 ? (
              <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2">
                No compatible connections. Connect {type === "notion" ? "Notion" : "Google"} at{" "}
                <a href="/admin/settings/connections" className="underline font-medium">
                  Settings → Connections
                </a>
                .
              </p>
            ) : (
              <FilterDropdown
                fullWidth
                label=""
                value={connectionId}
                onChange={setConnectionId}
                options={[
                  { value: "", label: "— pick a connection —" },
                  ...compatibleConnections.map((c) => ({
                    value: c.id,
                    label: `${c.platform} · ${c.displayName || c.scope}`,
                  })),
                ]}
              />
            )}
          </div>

          {type === "notion" && (
            <div>
              <label className={labelClass}>Notion database ID</label>
              <input
                value={databaseId}
                onChange={(e) => setDatabaseId(e.target.value)}
                placeholder="paste database ID from Notion URL"
                className={`${inputClass} font-mono`}
              />
              <p className="text-xs text-[var(--muted)] mt-1.5">
                Open the database in Notion → Share → copy the ID from the URL. Share the
                database with the Choquer integration too.
              </p>
            </div>
          )}

          {type === "sheets" && (
            <>
              <div>
                <label className={labelClass}>Spreadsheet ID</label>
                <input
                  value={spreadsheetId}
                  onChange={(e) => setSpreadsheetId(e.target.value)}
                  placeholder="paste from sheets URL"
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Sheet name</label>
                  <input
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Write mode</label>
                  <FilterDropdown
                    fullWidth
                    label=""
                    value={writeMode}
                    onChange={(v) => setWriteMode(v as any)}
                    options={[
                      { value: "replace", label: "Replace each run" },
                      { value: "append", label: "Append" },
                    ]}
                  />
                </div>
              </div>
            </>
          )}

          {type === "bigquery" && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Project ID</label>
                <input
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Dataset</label>
                <input
                  value={datasetId}
                  onChange={(e) => setDatasetId(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Table</label>
                <input
                  value={tableId}
                  onChange={(e) => setTableId(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-8 py-4 border-t border-[var(--border)] bg-white">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Add Destination"}
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
