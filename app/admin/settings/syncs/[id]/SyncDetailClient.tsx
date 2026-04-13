"use client";

import { useEffect, useState } from "react";

interface SyncRun {
  _id: string;
  _creationTime: number;
  syncJobId: string;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  status: "running" | "success" | "error" | string;
  rowsWritten?: number;
  rowsRead?: number;
  error?: string;
  triggeredBy: "schedule" | "manual" | "mcp" | string;
}

export default function SyncDetailClient({ id }: { id: string }) {
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const res = await fetch(`/api/admin/syncs/${id}/runs`);
    if (res.ok) setRuns((await res.json()).runs);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">
      <header>
        <a href="/admin/settings/syncs" className="text-xs text-indigo-600 hover:underline">
          ← All syncs
        </a>
        <h1 className="text-2xl font-semibold text-gray-900 mt-2">Sync history</h1>
      </header>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : runs.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-lg p-12 text-center text-sm text-gray-500">
          No runs yet.
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left p-3 font-medium">When</th>
                <th className="text-left p-3 font-medium">Trigger</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Duration</th>
                <th className="text-left p-3 font-medium">Rows (read / written)</th>
                <th className="text-left p-3 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r._id} className="border-t border-gray-100">
                  <td className="p-3 text-gray-600">{formatTime(r.startedAt)}</td>
                  <td className="p-3 font-mono text-xs">{r.triggeredBy}</td>
                  <td className="p-3">
                    {r.status === "success" ? (
                      <span className="text-green-700">ok</span>
                    ) : r.status === "error" ? (
                      <span className="text-red-600">error</span>
                    ) : (
                      <span className="text-gray-500">{r.status}</span>
                    )}
                  </td>
                  <td className="p-3 text-gray-600">
                    {r.durationMs != null ? `${r.durationMs}ms` : "—"}
                  </td>
                  <td className="p-3 text-gray-600">
                    {(r.rowsRead ?? "—")} / {(r.rowsWritten ?? "—")}
                  </td>
                  <td className="p-3 text-red-600 text-xs max-w-xs truncate" title={r.error}>
                    {r.error || ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString();
}
