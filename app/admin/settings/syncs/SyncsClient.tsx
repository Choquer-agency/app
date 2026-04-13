"use client";

import { useEffect, useState } from "react";

interface SyncJob {
  _id: string;
  name: string;
  clientId: string;
  sourcePlatform: string;
  destinationId: string;
  metrics: string[];
  dimensions: string[];
  dateRangePreset: string;
  frequency: string;
  nextRunAt: number;
  lastRunAt?: number;
  active: boolean;
}

interface Destination {
  _id: string;
  name: string;
  type: string;
}

interface Client {
  id: string;
  name: string;
  slug: string;
}

const PLATFORM_OPTS = [
  { value: "ga4", label: "Google Analytics (GA4)" },
  { value: "gsc", label: "Search Console" },
  { value: "google_ads", label: "Google Ads" },
  { value: "youtube", label: "YouTube" },
  { value: "gbp", label: "Business Profile" },
  { value: "pagespeed", label: "PageSpeed" },
];

const DEFAULT_METRICS: Record<string, string[]> = {
  ga4: ["sessions", "activeUsers", "engagementRate"],
  gsc: ["clicks", "impressions", "ctr", "position"],
  google_ads: ["metrics.impressions", "metrics.clicks", "metrics.cost_micros", "metrics.conversions"],
  youtube: ["views", "estimatedMinutesWatched", "subscribersGained"],
  gbp: [
    "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
    "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
    "WEBSITE_CLICKS",
    "CALL_CLICKS",
  ],
  pagespeed: ["performance", "lcp", "inp", "cls"],
};

const DEFAULT_DIMENSIONS: Record<string, string[]> = {
  ga4: ["date"],
  gsc: ["date"],
  google_ads: ["segments.date"],
  youtube: ["day"],
  gbp: [],
  pagespeed: [],
};

const PRESET_OPTS = [
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_28_days", label: "Last 28 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "mtd", label: "Month to date" },
];

export default function SyncsClient() {
  const [syncs, setSyncs] = useState<SyncJob[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  const load = async () => {
    const [sRes, dRes, cRes] = await Promise.all([
      fetch("/api/admin/syncs"),
      fetch("/api/admin/destinations"),
      fetch("/api/admin/clients"),
    ]);
    if (sRes.ok) setSyncs((await sRes.json()).syncs);
    if (dRes.ok) setDestinations((await dRes.json()).destinations);
    if (cRes.ok) {
      const body = await cRes.json();
      setClients(Array.isArray(body) ? body : body.clients ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const runNow = async (id: string) => {
    setRunningId(id);
    try {
      const res = await fetch(`/api/admin/syncs/${id}/run`, { method: "POST" });
      const body = await res.json();
      if (res.ok) {
        alert(`Sync complete: ${body.rowsWritten} rows written.\n${body.destinationRef}`);
      } else {
        alert(`Run failed: ${body.error}`);
      }
      await load();
    } finally {
      setRunningId(null);
    }
  };

  const toggle = async (id: string, active: boolean) => {
    await fetch(`/api/admin/syncs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    await load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this sync? Run history is kept.")) return;
    await fetch(`/api/admin/syncs/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Syncs</h1>
          <p className="text-sm text-gray-600 mt-1">
            Scheduled jobs that pull data from connected sources and push to destinations.
          </p>
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium"
          disabled={destinations.length === 0 || clients.length === 0}
        >
          New sync
        </button>
      </header>

      {destinations.length === 0 && (
        <div className="border border-amber-200 bg-amber-50 text-amber-900 rounded p-3 text-sm">
          Add a destination first at{" "}
          <a href="/admin/settings/destinations" className="underline font-medium">
            Settings → Destinations
          </a>
          .
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : syncs.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-lg p-12 text-center">
          <div className="text-gray-500 text-sm">No syncs yet.</div>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Client</th>
                <th className="text-left p-3 font-medium">Source</th>
                <th className="text-left p-3 font-medium">Destination</th>
                <th className="text-left p-3 font-medium">Next run</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {syncs.map((s) => {
                const dest = destinations.find((d) => d._id === s.destinationId);
                const client = clients.find((c) => c.id === s.clientId);
                return (
                  <tr key={s._id} className="border-t border-gray-100">
                    <td className="p-3">
                      <a
                        href={`/admin/settings/syncs/${s._id}`}
                        className="font-medium text-gray-900 hover:text-indigo-600"
                      >
                        {s.name}
                      </a>
                      <div className="text-xs text-gray-500">{s.frequency}</div>
                    </td>
                    <td className="p-3">{client?.name ?? "—"}</td>
                    <td className="p-3 font-mono text-xs">{s.sourcePlatform}</td>
                    <td className="p-3">{dest?.name ?? "—"}</td>
                    <td className="p-3 text-gray-600">{formatTime(s.nextRunAt)}</td>
                    <td className="p-3">
                      {s.active ? (
                        <span className="text-green-700">Active</span>
                      ) : (
                        <span className="text-gray-400">Paused</span>
                      )}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => runNow(s._id)}
                        disabled={runningId === s._id}
                        className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 mr-1 disabled:opacity-50"
                      >
                        {runningId === s._id ? "Running…" : "Run now"}
                      </button>
                      <button
                        onClick={() => toggle(s._id, !s.active)}
                        className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 mr-1"
                      >
                        {s.active ? "Pause" : "Resume"}
                      </button>
                      <button
                        onClick={() => del(s._id)}
                        className="text-xs px-2 py-1 border border-red-300 text-red-700 rounded hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {wizardOpen && (
        <NewSyncWizard
          clients={clients}
          destinations={destinations}
          onClose={() => setWizardOpen(false)}
          onCreated={() => {
            setWizardOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function NewSyncWizard({
  clients,
  destinations,
  onClose,
  onCreated,
}: {
  clients: Client[];
  destinations: Destination[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [platform, setPlatform] = useState("ga4");
  const [destinationId, setDestinationId] = useState("");
  const [preset, setPreset] = useState("last_28_days");
  const [frequency, setFrequency] = useState<"hourly" | "daily" | "weekly">("daily");
  const [hourOfDay, setHourOfDay] = useState(14); // 14 UTC = 6am PT
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!clientId || !platform || !destinationId) {
      alert("Client, source, and destination are required.");
      return;
    }
    setSubmitting(true);
    try {
      const client = clients.find((c) => c.id === clientId);
      const dest = destinations.find((d) => d._id === destinationId);
      const autoName =
        name || `${client?.name ?? "Client"} · ${platform} → ${dest?.name ?? "dest"} (${frequency})`;

      const res = await fetch("/api/admin/syncs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: autoName,
          clientId,
          sourcePlatform: platform,
          destinationId,
          metrics: DEFAULT_METRICS[platform] ?? [],
          dimensions: DEFAULT_DIMENSIONS[platform] ?? [],
          dateRangePreset: preset,
          frequency,
          hourOfDay,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error || "Failed to create sync");
      } else {
        onCreated();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-auto">
        <h2 className="text-lg font-semibold">New sync</h2>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700">Client</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          >
            <option value="">— pick a client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700">Source platform</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          >
            {PLATFORM_OPTS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            Default metrics for {platform}:{" "}
            <code className="bg-gray-100 px-1 rounded">
              {(DEFAULT_METRICS[platform] ?? []).join(", ")}
            </code>
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700">Destination</label>
          <select
            value={destinationId}
            onChange={(e) => setDestinationId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          >
            <option value="">— pick a destination —</option>
            {destinations.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name} ({d.type})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Date range</label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
            >
              {PRESET_OPTS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Frequency</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as any)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
            >
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
        </div>

        {(frequency === "daily" || frequency === "weekly") && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">
              Hour (UTC) — 14 UTC ≈ 6am PT / 9am ET
            </label>
            <input
              type="number"
              min={0}
              max={23}
              value={hourOfDay}
              onChange={(e) => setHourOfDay(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
            />
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700">Name (optional)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Auto-generated if blank"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </div>

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
            {submitting ? "Creating…" : "Create sync"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTime(epochMs: number): string {
  const diff = epochMs - Date.now();
  const minutes = Math.round(diff / 60000);
  if (minutes < -1) return `${Math.abs(minutes)}m overdue`;
  if (minutes < 1) return "any second now";
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days}d`;
}
