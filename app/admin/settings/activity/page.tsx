import {
  getEngagementSummary,
  getSectionHeatmap,
  getChurnRiskClients,
  getVisitorEngagement,
  getVisitorChurnRisk,
} from "@/lib/db";
import { getActiveClients } from "@/lib/clients";
import { friendlyDateTime, friendlyDate } from "@/lib/date-format";

export const dynamic = "force-dynamic";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export default async function AdminActivityPage() {
  let engagement: Awaited<ReturnType<typeof getEngagementSummary>> = [];
  let heatmap: Awaited<ReturnType<typeof getSectionHeatmap>> = [];
  let churnRisk: Awaited<ReturnType<typeof getChurnRiskClients>> = [];
  let visitorEngagement: Awaited<ReturnType<typeof getVisitorEngagement>> = [];
  let visitorChurn: Awaited<ReturnType<typeof getVisitorChurnRisk>> = [];
  let hasData = true;

  try {
    [engagement, heatmap, churnRisk, visitorEngagement, visitorChurn] = await Promise.all([
      getEngagementSummary(),
      getSectionHeatmap(),
      getChurnRiskClients(30),
      getVisitorEngagement(30),
      getVisitorChurnRisk(30),
    ]);
  } catch {
    hasData = false;
  }

  const churnSlugs = new Set(churnRisk.map((r) => r.client_slug));
  const churnVisitorIds = new Set(visitorChurn.map((r) => r.visitor_id));

  const clients = await getActiveClients();
  const notionUrlMap = new Map(clients.map((c) => [c.slug, c.notionPageUrl]));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[var(--foreground)]">Client Engagement</h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            Activity tracking across all client dashboards
          </p>
        </div>
      </div>

      {!hasData && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
          Database not connected. Set up Vercel Postgres and run the schema to see activity data.
        </div>
      )}

      {visitorEngagement.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold">Visitors</h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">Identified people visiting client dashboards</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--accent-light)] border-b border-[var(--border)]">
                  <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Client</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Last Visit</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Visits (7d)</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Visits (30d)</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Time (30d)</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">CTA Clicks</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Status</th>
                </tr>
              </thead>
              <tbody>
                {visitorEngagement.map((row) => (
                  <tr key={row.visitor_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <a href={`/admin/settings/activity/${row.visitor_id}`} className="font-medium text-[var(--accent)] hover:underline">
                        {row.visitor_name}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">{row.client_slug}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {row.last_visit
                        ? friendlyDateTime(row.last_visit)
                        : "—"}
                    </td>
                    <td className="px-4 py-3">{row.visits_7d}</td>
                    <td className="px-4 py-3">{row.visits_30d}</td>
                    <td className="px-4 py-3">{row.total_time_seconds ? formatDuration(Number(row.total_time_seconds)) : "—"}</td>
                    <td className="px-4 py-3">{row.cta_clicks}</td>
                    <td className="px-4 py-3">
                      {churnVisitorIds.has(row.visitor_id) ? (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Inactive</span>
                      ) : (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold">Client Overview</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">All activity by client slug (includes anonymous sessions)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--accent-light)] border-b border-[var(--border)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Client</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Notion</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Last Visit</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Visits (7d)</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Visits (30d)</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Sessions (30d)</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">CTA Clicks</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Status</th>
              </tr>
            </thead>
            <tbody>
              {engagement.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[var(--muted)]">
                    No activity data yet. Data will appear once clients visit their dashboards.
                  </td>
                </tr>
              ) : (
                engagement.map((row) => (
                  <tr key={row.client_slug} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{row.client_slug}</td>
                    <td className="px-4 py-3">
                      {notionUrlMap.get(row.client_slug) ? (
                        <a href={notionUrlMap.get(row.client_slug)} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline text-xs" title="Open in Notion">Open</a>
                      ) : (
                        <span className="text-[var(--muted)] text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {row.last_visit ? friendlyDateTime(row.last_visit) : "—"}
                    </td>
                    <td className="px-4 py-3">{row.visits_7d}</td>
                    <td className="px-4 py-3">{row.visits_30d}</td>
                    <td className="px-4 py-3">{row.sessions_30d}</td>
                    <td className="px-4 py-3">{row.cta_clicks}</td>
                    <td className="px-4 py-3">
                      {churnSlugs.has(row.client_slug) ? (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Churn Risk</span>
                      ) : (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Active</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold mb-4">Section Engagement (Last 30 Days)</h3>
        {heatmap.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No section view data yet.</p>
        ) : (
          <div className="space-y-2">
            {heatmap.map((row) => {
              const maxViews = Math.max(...heatmap.map((r) => Number(r.view_count)));
              const pct = maxViews > 0 ? (Number(row.view_count) / maxViews) * 100 : 0;
              return (
                <div key={row.section} className="flex items-center gap-3">
                  <span className="text-sm w-32 text-[var(--muted)]">{row.section}</span>
                  <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-medium w-12 text-right">{row.view_count}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {visitorChurn.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <h3 className="font-semibold text-red-800 mb-2">Inactive Visitors ({visitorChurn.length})</h3>
          <p className="text-sm text-red-600 mb-3">These people haven&apos;t visited in 30+ days.</p>
          <ul className="space-y-1">
            {visitorChurn.map((row) => (
              <li key={row.visitor_id} className="text-sm">
                <a href={`/admin/settings/activity/${row.visitor_id}`} className="font-medium text-red-800 hover:underline">{row.visitor_name}</a>
                <span className="text-red-500 ml-1">({row.client_slug})</span>
                <span className="text-red-500 ml-2">Last visit: {friendlyDate(row.last_visit)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {churnRisk.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
          <h3 className="font-semibold text-orange-800 mb-2">Churn Risk by Client ({churnRisk.length} client{churnRisk.length > 1 ? "s" : ""})</h3>
          <p className="text-sm text-orange-600 mb-3">These client dashboards haven&apos;t had any visits in 30+ days.</p>
          <ul className="space-y-1">
            {churnRisk.map((row) => (
              <li key={row.client_slug} className="text-sm">
                <span className="font-medium">{row.client_slug}</span>
                <span className="text-orange-500 ml-2">Last visit: {friendlyDate(row.last_visit)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
