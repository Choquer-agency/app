import { notFound } from "next/navigation";
import Header from "@/components/Header";
import MetricsSection from "@/components/MetricsSection";
import GoalsSection from "@/components/GoalsSection";
import WorkLog from "@/components/WorkLog";
import HistoricalReports from "@/components/HistoricalReports";
import UpcomingMonths from "@/components/UpcomingMonths";
import Footer from "@/components/Footer";
import ClientDashboardTracker from "@/components/ClientDashboardTracker";
import AnalyticsBlurOverlay from "@/components/AnalyticsBlurOverlay";
import ApprovalSection from "@/components/ApprovalSection";

import { getGSCKPIs, getGSCTopPages, getDateRange } from "@/lib/gsc";
import { getGA4KPIs, getGA4UsersTimeSeries, getGA4TrafficAcquisition, getGA4OrganicSessionsForRange } from "@/lib/ga4";
import type { TrafficChannel } from "@/lib/ga4";
import { getKeywordRankings, getProjectStats } from "@/lib/serankings";
import type { SERankingStats } from "@/lib/serankings";
import { getClientBySlug } from "@/lib/clients";
import { getEnrichedContent, getApprovals } from "@/lib/db";
import {
  ClientConfig,
  KPIData,
  TimeSeriesPoint,
  TopPage,
  KeywordRanking,
  QuarterlyGoal,
  WorkLogEntry,
} from "@/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) return { title: "SEO Dashboard" };
  return { title: `${client.name} — SEO Dashboard` };
}

const USE_GOOGLE = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function getNextMonth(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
}

function getFutureMonth(offset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadEnrichedContent(slug: string): Promise<any | null> {
  try {
    const dbResult = await getEnrichedContent(slug);
    if (dbResult?.enrichedData) {
      return {
        ...dbResult.enrichedData,
        processedAt: dbResult.processedAt?.toISOString?.() || dbResult.processedAt,
      };
    }
  } catch {}
  return null;
}

function getCurrentQuarter(): string {
  const now = new Date();
  return `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`;
}

// Parse deadline strings like "End of Q1 2026", "Q2 2026", "August 2025" into a comparable date
function isGoalExpired(deadline: string): boolean {
  const now = new Date();
  // Match "Q1 2026" pattern
  const quarterMatch = deadline.match(/Q(\d)\s+(\d{4})/);
  if (quarterMatch) {
    const q = parseInt(quarterMatch[1]);
    const year = parseInt(quarterMatch[2]);
    // End of quarter: Q1=Mar31, Q2=Jun30, Q3=Sep30, Q4=Dec31
    const endMonth = q * 3;
    const endOfQuarter = new Date(year, endMonth, 0); // last day of the quarter's final month
    return now > endOfQuarter;
  }
  // Match month+year like "August 2025"
  const monthMatch = deadline.match(/(\w+)\s+(\d{4})/);
  if (monthMatch) {
    const monthStr = monthMatch[1];
    const year = parseInt(monthMatch[2]);
    const monthIndex = new Date(`${monthStr} 1, ${year}`).getMonth();
    if (!isNaN(monthIndex)) {
      const endOfMonth = new Date(year, monthIndex + 1, 0);
      return now > endOfMonth;
    }
  }
  return false;
}

function formatMonthLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// ─── Page ───────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ClientDashboard({ params }: PageProps) {
  const { slug } = await params;

  // Get client from database — if not found, 404
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  // Try enriched content (from AI pipeline — file first, then DB)
  const [enriched, approvals] = await Promise.all([
    loadEnrichedContent(slug),
    getApprovals(slug).catch(() => []),
  ]);
  const pendingApprovals = approvals.filter((a) => a.status === "pending").length;

  let goals: QuarterlyGoal[] = [];
  let workLog: WorkLogEntry[] = [];
  let plan: WorkLogEntry[] = [];
  let historicalMonths: string[] = [];
  let workLogsByMonth: Record<string, WorkLogEntry[]> = {};
  let summariesByMonth: Record<string, string> = {};
  let metricsByMonth: Record<string, { sessions?: number; impressions?: number; notableWins?: string[] }> = {};

  if (enriched) {
    goals = (enriched.goals || [])
      .filter((g: { deadline?: string }) => !g.deadline || !isGoalExpired(g.deadline))
      .map((g: { goal: string; icon: string; targetMetric: string; progress: number; deadline: string; targetMetricType?: string; targetValue?: number }, i: number) => ({
      id: `eg-${i}`,
      goal: g.goal,
      icon: g.icon || "\uD83C\uDFAF",
      targetMetric: g.targetMetric,
      progress: (g.targetMetricType && g.targetValue) ? 0 : g.progress || 0, // default 0 for live-data goals until KPI map overrides
      quarter: g.deadline || getCurrentQuarter(),
      targetMetricType: g.targetMetricType,
      targetValue: g.targetValue,
      verified: false, // will be set to true if live data backs it
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    workLog = (enriched.currentMonth?.tasks || []).map((t: any, i: number) => ({
      id: `et-${i}`,
      task: t.task,
      category: t.category || [],
      subtasks: t.subtasks || [],
      deliverableLinks: t.deliverableLinks || [],
      monthlySummary: i === 0 ? (enriched.currentMonth?.summary || "") : "",
      month: getCurrentMonth(),
      isPlan: false,
      impact: t.impact || "",
      completed: t.completed,
    }));

    plan = [];

    if (enriched.pastMonths?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      enriched.pastMonths.forEach((pm: any, mi: number) => {
        const monthKey = pm.label || pm.monthLabel || `past-${mi}`;
        historicalMonths.push(monthKey);
        workLogsByMonth[monthKey] = (pm.tasks || []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (t: any, ti: number) => ({
            id: `ep-${mi}-${ti}`,
            task: typeof t === "string" ? t : t.task,
            category: typeof t === "string" ? [] : (t.category || []),
            subtasks: typeof t === "string" ? "" : (t.subtasks || []),
            deliverableLinks: typeof t === "string" ? [] : (t.deliverableLinks || []),
            monthlySummary: "",
            month: monthKey,
            isPlan: false,
            completed: typeof t === "string" ? true : (t.completed ?? true),
          })
        );
        if (pm.summary) summariesByMonth[monthKey] = pm.summary;
        if (pm.metrics) metricsByMonth[monthKey] = pm.metrics;
      });
    }
  }

  // ── Fetch live analytics (GSC and GA4 independently) ────────────────────
  let usersTimeSeries: TimeSeriesPoint[] = [];
  let trafficChannels: TrafficChannel[] = [];
  let topPages: TopPage[] = [];
  let keywords: KeywordRanking[] = [];
  let gscConnected = false;
  let ga4Connected = false;

  // Always initialize all base KPI slots so the layout stays consistent
  const UNAVAILABLE = -1;
  let clicksKpi: KPIData = { label: "Clicks", value: UNAVAILABLE, previousValue: 0, changePercent: 0, format: "number" };
  let impressionsKpi: KPIData = { label: "Impressions", value: UNAVAILABLE, previousValue: 0, changePercent: 0, format: "number" };
  let ctrKpi: KPIData = { label: "CTR", value: UNAVAILABLE, previousValue: 0, changePercent: 0, format: "percent" };
  let sessionsKpi: KPIData = { label: "Organic Sessions", value: UNAVAILABLE, previousValue: 0, changePercent: 0, format: "number" };
  let totalSessionsKpi: KPIData = { label: "Sessions", value: UNAVAILABLE, previousValue: 0, changePercent: 0, format: "number" };

  if (USE_GOOGLE) {
    const { startDate, endDate } = getDateRange("28d");

    // Fetch GSC data independently
    if (client.gscSiteUrl) {
      try {
        const [gscKpis, gscTopPages] = await Promise.all([
          getGSCKPIs(client.gscSiteUrl, "28d"),
          getGSCTopPages(client.gscSiteUrl, startDate, endDate, 10),
        ]);
        clicksKpi = gscKpis.clicks;
        impressionsKpi = gscKpis.impressions;
        ctrKpi = {
          label: "CTR",
          value: gscKpis.clicks.value && gscKpis.impressions.value
            ? (gscKpis.clicks.value / gscKpis.impressions.value) * 100
            : 0,
          previousValue: 0,
          changePercent: 0,
          format: "percent",
        };
        topPages = gscTopPages;
        gscConnected = true;
      } catch (error) {
        console.error(`GSC failed for ${slug}:`, error);
      }
    }

    // Fetch GA4 data independently
    if (client.ga4PropertyId) {
      try {
        const [ga4Kpis, usersTs, channels] = await Promise.all([
          getGA4KPIs(client.ga4PropertyId),
          getGA4UsersTimeSeries(client.ga4PropertyId, startDate, endDate),
          getGA4TrafficAcquisition(client.ga4PropertyId, startDate, endDate),
        ]);
        sessionsKpi = ga4Kpis.organicSessions;
        totalSessionsKpi = ga4Kpis.totalSessions;
        usersTimeSeries = usersTs;
        trafficChannels = channels;
        ga4Connected = true;
      } catch (error) {
        console.error(`GA4 failed for ${slug}:`, error);
      }
    }
  }

  let kpis: KPIData[] = [clicksKpi, impressionsKpi, ctrKpi, sessionsKpi];

  // Fetch SE Rankings keyword data independently
  let seRankingStats: SERankingStats | null = null;
  if (client.seRankingsProjectId) {
    try {
      [keywords, seRankingStats] = await Promise.all([
        getKeywordRankings(client.seRankingsProjectId),
        getProjectStats(client.seRankingsProjectId),
      ]);
    } catch (error) {
      console.error(`SE Rankings failed for ${slug}:`, error);
    }
  }

  // Add leads KPI from enriched data (manually updated in Notion)
  const currentLeads = enriched?.currentMonth?.leads;
  if (currentLeads !== undefined && currentLeads !== null) {
    // Find previous month leads for MoM comparison
    let prevLeads: number | undefined;
    if (enriched?.pastMonths?.length) {
      const lastPastMonth = enriched.pastMonths[0]; // most recent past month
      prevLeads = lastPastMonth?.leads;
    }
    const changePercent = prevLeads && prevLeads > 0
      ? Math.round(((currentLeads - prevLeads) / prevLeads) * 100)
      : 0;
    kpis.push({
      label: "Leads",
      value: currentLeads,
      previousValue: prevLeads || 0,
      changePercent,
      format: "number" as const,
    });
  }

  const analyticsConnected = gscConnected || ga4Connected;

  const isOnboarding = enriched?._onboarding === true;

  const summary = workLog.find((e) => e.monthlySummary)?.monthlySummary || "";
  const quarter = getCurrentQuarter();
  const currentMonthLabel = formatMonthLabel(getCurrentMonth());
  const lastUpdated = enriched?.processedAt || null;
  const nextMonthLabel = formatMonthLabel(getNextMonth());

  const allComplete = workLog.length > 0 && workLog.every((e) => !e.isPlan);

  // Compute cumulative impact: compare pre-agency baseline (3 months before start) to recent 3 months
  let cumulativeData: { startMonth: string; sessionsChange: number } | null = null;
  if (enriched?.pastMonths?.length && ga4Connected && client.ga4PropertyId) {
    // Find the earliest month from pastMonths (they're ordered most-recent-first)
    const allMonthKeys = [...historicalMonths].reverse(); // chronological
    const earliestMonthLabel = allMonthKeys[0]; // e.g. "December 2023"

    // Parse the month label into a date
    const parsedStart = new Date(earliestMonthLabel + " 1");
    if (!isNaN(parsedStart.getTime())) {
      // Pre-agency baseline: 3 months before the agency started
      const baselineEnd = new Date(parsedStart.getFullYear(), parsedStart.getMonth(), 0); // last day of month before start
      const baselineStart = new Date(parsedStart.getFullYear(), parsedStart.getMonth() - 3, 1); // 3 months before

      // Recent period: last 3 full months
      const now = new Date();
      const recentEnd = new Date(now.getFullYear(), now.getMonth(), 0); // end of last full month
      const recentStart = new Date(now.getFullYear(), now.getMonth() - 3, 1); // 3 months back

      const fmt = (d: Date) => d.toISOString().split("T")[0];

      try {
        const [baselineSessions, recentSessions] = await Promise.all([
          getGA4OrganicSessionsForRange(client.ga4PropertyId, fmt(baselineStart), fmt(baselineEnd)),
          getGA4OrganicSessionsForRange(client.ga4PropertyId, fmt(recentStart), fmt(recentEnd)),
        ]);

        if (baselineSessions > 0) {
          cumulativeData = {
            startMonth: earliestMonthLabel,
            sessionsChange: Math.round(((recentSessions - baselineSessions) / baselineSessions) * 100),
          };
        }
      } catch (error) {
        console.error(`Cumulative impact fetch failed for ${slug}:`, error);
      }
    }
  }

  // Compute live goal progress from KPI data
  if (kpis.length > 0) {
    const kpiMap: Record<string, number> = {};
    for (const kpi of kpis) {
      if (kpi.value === -1) continue; // skip unavailable metrics
      if (kpi.label === "Organic Sessions") kpiMap["organic_sessions"] = kpi.value;
      if (kpi.label === "Clicks") kpiMap["clicks"] = kpi.value;
      if (kpi.label === "Impressions") kpiMap["impressions"] = kpi.value;
    }
    if (totalSessionsKpi.value !== UNAVAILABLE) {
      kpiMap["sessions"] = totalSessionsKpi.value;
    }
    goals = goals.map((g) => {
      if (g.targetMetricType && g.targetValue && kpiMap[g.targetMetricType] !== undefined) {
        return { ...g, progress: Math.min(100, Math.round((kpiMap[g.targetMetricType] / g.targetValue) * 100)), currentValue: kpiMap[g.targetMetricType], verified: true };
      }
      return g;
    });
  }

  // Upcoming months — from enriched data only
  let upcomingMonths: { monthLabel: string; entries: WorkLogEntry[]; summary?: string }[];

  if (enriched?.upcomingMonths?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    upcomingMonths = enriched.upcomingMonths.map((m: any, mi: number) => ({
      monthLabel: m.monthLabel,
      summary: m.summary,
      entries: (m.tasks || []).map((t: string | { task: string; category?: string[]; subtasks?: string; deliverableLinks?: string[] }, ti: number) => {
        const task = typeof t === "string" ? t : t.task;
        const category = typeof t === "string" ? [] : (t.category || []);
        return {
          id: `eu-${mi}-${ti}`,
          task,
          category,
          subtasks: typeof t === "string" ? "" : (t.subtasks || ""),
          deliverableLinks: typeof t === "string" ? [] : (t.deliverableLinks || []),
          monthlySummary: "",
          month: "",
          isPlan: true,
        };
      }),
    }));
  } else {
    upcomingMonths = [];
  }

  return (
    <div className="min-h-screen bg-white">
      <Header client={client} pendingApprovals={pendingApprovals} />

      {/* ── Onboarding / Coming Soon ── */}
      {isOnboarding && (
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="bg-[#FAFCFF] rounded-2xl px-8 py-10 text-center border border-[#E8F0FE]">
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-2">
              Your Strategy Dashboard is Coming Soon
            </h2>
            <p className="text-sm text-[#6b7280] max-w-md mx-auto mb-6">
              Our team is building your custom SEO strategy. Once your plan is finalized,
              this dashboard will show your goals, monthly work progress, and performance history.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto">
              <div className="bg-white rounded-xl px-4 py-3 border border-[#F0F0F0]">
                <div className="text-xs font-medium text-[#6b7280] uppercase tracking-wide mb-1">Goals</div>
                <div className="text-sm text-[#9ca3af]">Coming soon</div>
              </div>
              <div className="bg-white rounded-xl px-4 py-3 border border-[#F0F0F0]">
                <div className="text-xs font-medium text-[#6b7280] uppercase tracking-wide mb-1">Work Log</div>
                <div className="text-sm text-[#9ca3af]">Coming soon</div>
              </div>
              <div className="bg-white rounded-xl px-4 py-3 border border-[#F0F0F0]">
                <div className="text-xs font-medium text-[#6b7280] uppercase tracking-wide mb-1">History</div>
                <div className="text-sm text-[#9ca3af]">Coming soon</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 1. Goals ── */}
      {!isOnboarding && goals.length > 0 && (
        <div className="max-w-3xl mx-auto px-6 pt-4">
          <GoalsSection goals={goals} quarter={quarter} />
        </div>
      )}

      {/* ── 1.5. Approvals ── */}
      {!isOnboarding && approvals.length > 0 && (
        <div className="max-w-3xl mx-auto px-6 pt-2">
          <ApprovalSection approvals={approvals} clientSlug={slug} />
        </div>
      )}

      {/* ── 2. This Month ── */}
      {!isOnboarding && workLog.length > 0 && (
        <div className="max-w-3xl mx-auto px-6 py-6">
          <WorkLog
            entries={workLog}
            summary={summary}
            monthLabel={currentMonthLabel}
            isComplete={allComplete && !!summary}
            goalSummary={
              !summary
                ? (enriched?.currentMonth?.strategy || undefined)
                : undefined
            }
            lastUpdated={lastUpdated}
            analyticsEnrichments={enriched?.analyticsEnrichments || []}
            taskCompletion={enriched?.currentMonth?.taskCompletion}
          />
        </div>
      )}

      {/* ── 3. Metrics — blurred if not connected ── */}
      <div className="max-w-3xl mx-auto px-6 pb-4">
        <AnalyticsBlurOverlay connected={analyticsConnected}>
          <div className="bg-[#FAFCFF] rounded-2xl px-8 py-6">
            <MetricsSection
              initialKpis={kpis}
              initialUsersTimeSeries={usersTimeSeries}
              initialTrafficChannels={trafficChannels}
              initialTopPages={topPages}
              initialKeywords={keywords}
              seRankingStats={seRankingStats}
              clientSlug={slug}
              initialRange="28d"
              cumulativeData={cumulativeData}
            />
          </div>
        </AnalyticsBlurOverlay>
      </div>

      {/* ── 4. Upcoming Months ── */}
      {!isOnboarding && upcomingMonths.length > 0 && (
        <div className="max-w-3xl mx-auto px-6 pt-2 pb-4">
          <UpcomingMonths monthPlans={upcomingMonths} />
        </div>
      )}

      {/* ── 5. Past Months ── */}
      {!isOnboarding && historicalMonths.length > 0 && (
        <div className="max-w-3xl mx-auto px-6 pb-4">
          <HistoricalReports
            months={historicalMonths}
            workLogsByMonth={workLogsByMonth}
            summariesByMonth={summariesByMonth}
            metricsByMonth={metricsByMonth}
            clientSlug={slug}
          />
        </div>
      )}

      <Footer />
      <ClientDashboardTracker slug={slug} />
    </div>
  );
}
