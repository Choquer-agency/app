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
import { getGA4KPIs, getGA4UsersTimeSeries, getGA4TrafficAcquisition } from "@/lib/ga4";
import type { TrafficChannel } from "@/lib/ga4";
import { getKeywordRankings } from "@/lib/serankings";
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

    workLog = (enriched.currentMonth?.tasks || []).map((t: { task: string; category: string[]; subtasks: string; deliverableLinks: string[]; impact?: string }, i: number) => ({
      id: `et-${i}`,
      task: t.task,
      category: t.category || [],
      subtasks: t.subtasks || "",
      deliverableLinks: t.deliverableLinks || [],
      monthlySummary: i === 0 ? (enriched.currentMonth?.summary || "") : "",
      month: getCurrentMonth(),
      isPlan: false,
      impact: t.impact || "",
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
            subtasks: typeof t === "string" ? "" : (t.subtasks || ""),
            deliverableLinks: typeof t === "string" ? [] : (t.deliverableLinks || []),
            monthlySummary: "",
            month: monthKey,
            isPlan: false,
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
  if (client.seRankingsProjectId) {
    try {
      keywords = await getKeywordRankings(client.seRankingsProjectId);
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

  const summary = workLog.find((e) => e.monthlySummary)?.monthlySummary || "";
  const quarter = getCurrentQuarter();
  const currentMonthLabel = formatMonthLabel(getCurrentMonth());
  const lastUpdated = enriched?.processedAt || null;
  const nextMonthLabel = formatMonthLabel(getNextMonth());

  const allComplete = workLog.length > 0 && workLog.every((e) => !e.isPlan);

  // Compute cumulative impact since first agency month
  let cumulativeData: { startMonth: string; sessionsChange: number } | null = null;
  if (enriched?.pastMonths?.length) {
    const allMonthKeys = [...historicalMonths].reverse(); // chronological
    const firstMonth = allMonthKeys[0];
    const firstSessions = metricsByMonth[firstMonth]?.sessions;
    const latestMonth = allMonthKeys[allMonthKeys.length - 1];
    const latestSessions = metricsByMonth[latestMonth]?.sessions;
    if (firstSessions && latestSessions && firstSessions > 0) {
      cumulativeData = {
        startMonth: formatMonthLabel(firstMonth),
        sessionsChange: Math.round(((latestSessions - firstSessions) / firstSessions) * 100),
      };
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

      {/* ── 1. Goals ── */}
      {goals.length > 0 && (
        <div className="max-w-3xl mx-auto px-6 pt-4">
          <GoalsSection goals={goals} quarter={quarter} />
        </div>
      )}

      {/* ── 1.5. Approvals ── */}
      {approvals.length > 0 && (
        <div className="max-w-3xl mx-auto px-6 pt-2">
          <ApprovalSection approvals={approvals} clientSlug={slug} />
        </div>
      )}

      {/* ── 2. This Month ── */}
      {workLog.length > 0 && (
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
              clientSlug={slug}
              initialRange="28d"
              cumulativeData={cumulativeData}
            />
          </div>
        </AnalyticsBlurOverlay>
      </div>

      {/* ── 4. Upcoming Months ── */}
      {upcomingMonths.length > 0 && (
        <div className="max-w-3xl mx-auto px-6 pt-2 pb-4">
          <UpcomingMonths monthPlans={upcomingMonths} />
        </div>
      )}

      {/* ── 5. Past Months ── */}
      {historicalMonths.length > 0 && (
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
