import { notFound } from "next/navigation";
import { friendlyMonthFull } from "@/lib/date-format";
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
import MonthlyStrategyApprovalCard from "@/components/MonthlyStrategyApprovalCard";
import ClientPortalShell from "@/components/client-portal/ClientPortalShell";

import { getGSCKPIs, getGSCTopPages, getDateRange } from "@/lib/gsc";
import { getGA4KPIs, getGA4UsersTimeSeries, getGA4TrafficAcquisition, getGA4OrganicSessionsForRange } from "@/lib/ga4";
import type { TrafficChannel } from "@/lib/ga4";
import { getKeywordRankings, getProjectStats } from "@/lib/serankings";
import type { SERankingStats } from "@/lib/serankings";
import { getClientBySlug } from "@/lib/clients";
import { getClientPackages } from "@/lib/client-packages";
import { getEnrichedContent, getApprovals } from "@/lib/db";
import { getTickets } from "@/lib/tickets";
import { getMonthBySlug, monthKeyOf } from "@/lib/seo-strategy-months";
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
  if (!client) return { title: "Dashboard" };
  return { title: `${client.name} — Dashboard` };
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
  return friendlyMonthFull(iso);
}

// ─── Page ───────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ClientDashboard({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const activeTab = (typeof sp.tab === "string" ? sp.tab : undefined);

  // Get client from database — if not found, 404
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  // Fetch packages and ticket count for navigation
  const [clientPackages, clientTickets] = await Promise.all([
    getClientPackages(client.id).catch(() => []),
    getTickets({ clientId: client.id, archived: false, isPersonal: false, limit: 1 }).catch(() => []),
  ]);
  const activePackages = clientPackages.filter((p) => p.active);
  const hasTickets = clientTickets.length > 0;

  // Determine default tab from packages
  const defaultTab = activePackages.length > 0
    ? (activePackages
        .map((p) => p.packageCategory || "other")
        .sort((a, b) => {
          const order: Record<string, number> = { seo: 1, retainer: 2, google_ads: 3, social_media_ads: 4, blog: 5, website: 6, other: 7 };
          return (order[a] ?? 99) - (order[b] ?? 99);
        })[0])
    : "seo";

  const effectiveTab = activeTab || defaultTab;
  const isSeoTab = effectiveTab === "seo" || effectiveTab === defaultTab;

  // ── Only fetch expensive analytics data when on the SEO tab ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let enriched: any = null;
  let approvals: Awaited<ReturnType<typeof getApprovals>> = [];
  let goals: QuarterlyGoal[] = [];
  let workLog: WorkLogEntry[] = [];
  let historicalMonths: string[] = [];
  let workLogsByMonth: Record<string, WorkLogEntry[]> = {};
  let summariesByMonth: Record<string, string> = {};
  let metricsByMonth: Record<string, { sessions?: number; impressions?: number; notableWins?: string[] }> = {};
  let usersTimeSeries: TimeSeriesPoint[] = [];
  let trafficChannels: TrafficChannel[] = [];
  let topPages: TopPage[] = [];
  let keywords: KeywordRanking[] = [];
  let gscConnected = false;
  let ga4Connected = false;
  const UNAVAILABLE = -1;
  let clicksKpi: KPIData = { label: "Clicks", value: UNAVAILABLE, previousValue: 0, changePercent: 0, format: "number" };
  let impressionsKpi: KPIData = { label: "Impressions", value: UNAVAILABLE, previousValue: 0, changePercent: 0, format: "number" };
  let ctrKpi: KPIData = { label: "CTR", value: UNAVAILABLE, previousValue: 0, changePercent: 0, format: "percent" };
  let sessionsKpi: KPIData = { label: "Organic Sessions", value: UNAVAILABLE, previousValue: 0, changePercent: 0, format: "number" };
  let totalSessionsKpi: KPIData = { label: "Sessions", value: UNAVAILABLE, previousValue: 0, changePercent: 0, format: "number" };
  let kpis: KPIData[] = [];
  let seRankingStats: SERankingStats | null = null;
  let pendingApprovals = 0;
  let isOnboarding = false;
  let summary = "";
  let allComplete = false;
  let cumulativeData: { startMonth: string; sessionsChange: number } | null = null;
  let upcomingMonths: { monthLabel: string; entries: WorkLogEntry[]; summary?: string }[] = [];
  let lastUpdated: string | null = null;
  let analyticsConnected = false;
  let monthlyStrategy: Awaited<ReturnType<typeof getMonthBySlug>> = null;

  if (isSeoTab) {
    const now = new Date();
    const currentMonthKey = monthKeyOf(now.getFullYear(), now.getMonth() + 1);
    // Try enriched content (from AI pipeline)
    [enriched, approvals, monthlyStrategy] = await Promise.all([
      loadEnrichedContent(slug),
      getApprovals(slug).catch(() => []),
      getMonthBySlug(slug, currentMonthKey).catch(() => null),
    ]);
    pendingApprovals = approvals.filter((a) => a.status === "pending").length;

    if (enriched) {
      goals = (enriched.goals || [])
        .filter((g: { deadline?: string }) => !g.deadline || !isGoalExpired(g.deadline))
        .map((g: { goal: string; icon: string; targetMetric: string; progress: number; deadline: string; targetMetricType?: string; targetValue?: number }, i: number) => ({
        id: `eg-${i}`,
        goal: g.goal,
        icon: g.icon || "\uD83C\uDFAF",
        targetMetric: g.targetMetric,
        progress: (g.targetMetricType && g.targetValue) ? 0 : g.progress || 0,
        quarter: g.deadline || getCurrentQuarter(),
        targetMetricType: g.targetMetricType,
        targetValue: g.targetValue,
        verified: false,
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

    // ── Fetch live analytics (GSC and GA4 independently) ──
    if (USE_GOOGLE) {
      const { startDate, endDate } = getDateRange("28d");

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

    kpis = [clicksKpi, impressionsKpi, ctrKpi, sessionsKpi];

    // Fetch SE Rankings keyword data
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

    // Add leads KPI from enriched data
    const currentLeads = enriched?.currentMonth?.leads;
    if (currentLeads !== undefined && currentLeads !== null) {
      let prevLeads: number | undefined;
      if (enriched?.pastMonths?.length) {
        const lastPastMonth = enriched.pastMonths[0];
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

    analyticsConnected = gscConnected || ga4Connected;
    isOnboarding = enriched?._onboarding === true;
    summary = workLog.find((e) => e.monthlySummary)?.monthlySummary || "";
    allComplete = workLog.length > 0 && workLog.every((e) => !e.isPlan);
    lastUpdated = enriched?.processedAt || null;

    // Compute cumulative impact
    if (enriched?.pastMonths?.length && ga4Connected && client.ga4PropertyId) {
      const allMonthKeys = [...historicalMonths].reverse();
      const earliestMonthLabel = allMonthKeys[0];
      const parsedStart = new Date(earliestMonthLabel + " 1");
      if (!isNaN(parsedStart.getTime())) {
        const baselineEnd = new Date(parsedStart.getFullYear(), parsedStart.getMonth(), 0);
        const baselineStart = new Date(parsedStart.getFullYear(), parsedStart.getMonth() - 3, 1);
        const now = new Date();
        const recentEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        const recentStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
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
        if (kpi.value === -1) continue;
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

    // Upcoming months
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
    }
  } else {
    // Non-SEO tab: still need approvals count for the bell
    approvals = await getApprovals(slug).catch(() => []);
    pendingApprovals = approvals.filter((a) => a.status === "pending").length;
  }

  const quarter = getCurrentQuarter();
  const currentMonthLabel = formatMonthLabel(getCurrentMonth());
  const nextMonthLabel = formatMonthLabel(getNextMonth());

  // SEO dashboard content (rendered server-side, hidden by shell when not active)
  const seoContent = (
    <>
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

      {/* ── 1.6. Monthly strategy approval (per-month sign-off) ── */}
      {!isOnboarding && monthlyStrategy && (
        <div className="max-w-3xl mx-auto px-6 pt-2">
          <MonthlyStrategyApprovalCard
            slug={slug}
            monthKey={monthlyStrategy.monthKey}
            monthLabel={currentMonthLabel}
            initialApprovedAt={monthlyStrategy.clientApprovedAt ?? null}
          />
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
            lastUpdated={lastUpdated || undefined}
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
    </>
  );

  return (
    <div className="min-h-screen bg-white">
      <Header
        client={client}
        pendingApprovals={pendingApprovals}
        packages={activePackages}
        hasTickets={hasTickets}
      />

      <ClientPortalShell
        client={client}
        packages={activePackages}
        defaultTab={defaultTab}
      >
        {seoContent}
      </ClientPortalShell>

      <Footer />
      <ClientDashboardTracker slug={slug} />
    </div>
  );
}
