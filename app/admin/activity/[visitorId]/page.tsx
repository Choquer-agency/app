import { notFound } from "next/navigation";
import { getVisitorDetail } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function formatSections(sections: (string | null)[] | null): string {
  if (!sections) return "—";
  const filtered = sections.filter(Boolean);
  return filtered.length > 0 ? filtered.join(", ") : "—";
}

interface PageProps {
  params: Promise<{ visitorId: string }>;
}

export default async function VisitorDetailPage({ params }: PageProps) {
  const { visitorId } = await params;
  const id = parseInt(visitorId, 10);

  if (isNaN(id)) notFound();

  let data: Awaited<ReturnType<typeof getVisitorDetail>> = null;

  try {
    data = await getVisitorDetail(id, 90);
  } catch {
    // DB not connected
  }

  if (!data) notFound();

  const { visitor, sessions } = data;

  // Compute summary stats
  const totalVisits = sessions.filter((s) => Number(s.duration_seconds) > 0 || sessions.length === 1).length || sessions.length;
  const totalTime = sessions.reduce((sum, s) => sum + Number(s.duration_seconds || 0), 0);
  const avgTime = totalVisits > 0 ? Math.round(totalTime / totalVisits) : 0;
  const ctaClicks = sessions.filter((s) => s.clicked_cta).length;

  // Most viewed sections across all sessions
  const sectionCounts: Record<string, number> = {};
  for (const session of sessions) {
    const sections = session.sections_viewed as (string | null)[] | null;
    if (sections) {
      for (const s of sections) {
        if (s) sectionCounts[s] = (sectionCounts[s] || 0) + 1;
      }
    }
  }
  const topSections = Object.entries(sectionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Visits in the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentVisits = sessions.filter(
    (s) => new Date(s.session_start) > sevenDaysAgo
  ).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <a
          href="/admin/activity"
          className="text-sm text-accent hover:underline"
        >
          &larr; Back to Activity
        </a>
        <h2 className="text-2xl font-bold mt-2">{visitor.visitor_name}</h2>
        <p className="text-sm text-muted mt-1">
          {visitor.client_slug} &middot; First seen{" "}
          {new Date(visitor.created_at).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
          {visitor.device_types && (
            <> &middot; Devices: {(visitor.device_types as string[]).filter(Boolean).join(", ")}</>
          )}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-muted">Visits (7d)</p>
          <p className="text-2xl font-bold mt-1">{recentVisits}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-muted">Total Sessions (90d)</p>
          <p className="text-2xl font-bold mt-1">{totalVisits}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-muted">Avg Time / Visit</p>
          <p className="text-2xl font-bold mt-1">{formatDuration(avgTime)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-muted">CTA Clicks</p>
          <p className="text-2xl font-bold mt-1">{ctaClicks}</p>
        </div>
      </div>

      {/* Top Sections */}
      {topSections.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-3">Most Viewed Sections</h3>
          <div className="space-y-2">
            {topSections.map(([section, count]) => {
              const maxCount = topSections[0][1];
              const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
              return (
                <div key={section} className="flex items-center gap-3">
                  <span className="text-sm w-32 text-muted capitalize">{section}</span>
                  <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Session Timeline */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold">Visit History (Last 90 Days)</h3>
        </div>
        {sessions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            No sessions recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {sessions.map((session) => {
              const duration = Number(session.duration_seconds || 0);
              const sections = session.sections_viewed as (string | null)[] | null;
              const timeranges = session.timeranges_used as (string | null)[] | null;
              const months = session.months_opened as (string | null)[] | null;

              return (
                <div key={session.session_id} className="px-5 py-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {new Date(session.session_start).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        Duration: {formatDuration(duration)}
                      </p>
                    </div>
                    {session.clicked_cta && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        Clicked CTA
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {sections?.filter(Boolean).map((section) => (
                      <span
                        key={section}
                        className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full"
                      >
                        {section}
                      </span>
                    ))}
                    {timeranges?.filter(Boolean).map((range) => (
                      <span
                        key={range}
                        className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full"
                      >
                        {range} view
                      </span>
                    ))}
                    {months?.filter(Boolean).map((month) => (
                      <span
                        key={month}
                        className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full"
                      >
                        Opened {month}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
