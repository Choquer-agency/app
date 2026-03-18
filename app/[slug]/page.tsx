import { notFound } from "next/navigation";
import Header from "@/components/Header";
import MetricsSection from "@/components/MetricsSection";
import GoalsSection from "@/components/GoalsSection";
import WorkLog from "@/components/WorkLog";
import MonthlyPlan from "@/components/MonthlyPlan";
import HistoricalReports from "@/components/HistoricalReports";
import UpcomingMonths from "@/components/UpcomingMonths";
import Footer from "@/components/Footer";
import ClientDashboardTracker from "@/components/ClientDashboardTracker";

import { getQuarterlyGoals, getWorkLog, getMonthlyPlan, getWorkLogHistory } from "@/lib/notion";
import { getGSCKPIs, getGSCTopPages, getDateRange } from "@/lib/gsc";
import { getGA4KPIs, getGA4UsersTimeSeries, getGA4TrafficAcquisition } from "@/lib/ga4";
import type { TrafficChannel } from "@/lib/ga4";
import { getClientBySlug } from "@/lib/clients";
import fs from "fs";
import path from "path";
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

// ─── Placeholder data ───────────────────────────────────────────────────────

function getPlaceholderClient(slug: string): ClientConfig | null {
  // Fallback for demo only — real clients come from Postgres
  const clients: Record<string, ClientConfig> = {
    "century-plaza": {
      id: 0,
      name: "Century Plaza",
      slug: "century-plaza",
      ga4PropertyId: "properties/123456",
      gscSiteUrl: "https://www.century-plaza.com",
      seRankingsProjectId: "12345",
      calLink: "https://cal.com/andres-agudelo-hqlknm/15min",
      notionPageUrl: "",
      notionPageId: "",
      active: true,
    },
  };
  return clients[slug] || null;
}

function getPlaceholderKPIs(): KPIData[] {
  return [
    { label: "Clicks", value: 2340, previousValue: 2100, changePercent: 11.4, format: "number" },
    { label: "Impressions", value: 48200, previousValue: 44100, changePercent: 9.3, format: "number" },
    { label: "CTR", value: 4.9, previousValue: 4.8, changePercent: 2.1, format: "percent" },
    { label: "Organic Sessions", value: 3150, previousValue: 2890, changePercent: 9.0, format: "number" },
    { label: "Keywords Tracked", value: 142, previousValue: 138, changePercent: 2.9, format: "number" },
    { label: "Keywords Improved", value: 23, previousValue: 18, changePercent: 27.8, format: "number" },
  ];
}

function getPlaceholderTimeSeries(): TimeSeriesPoint[] {
  const data: TimeSeriesPoint[] = [];
  for (let i = 180; i >= 0; i -= 7) {
    const d = new Date(2026, 2, 17);
    d.setDate(d.getDate() - i);
    data.push({
      date: d.toISOString().split("T")[0],
      clicks: Math.floor(60 + Math.sin(i / 10) * 20 + (180 - i) * 0.3),
      impressions: Math.floor(1200 + Math.sin(i / 8) * 200 + (180 - i) * 3),
    });
  }
  return data;
}

function getPlaceholderSessions(): TimeSeriesPoint[] {
  const data: TimeSeriesPoint[] = [];
  for (let i = 180; i >= 0; i -= 7) {
    const d = new Date(2026, 2, 17);
    d.setDate(d.getDate() - i);
    data.push({
      date: d.toISOString().split("T")[0],
      organicSessions: Math.floor(80 + Math.sin(i / 12) * 15 + (180 - i) * 0.2),
    });
  }
  return data;
}

function getPlaceholderTopPages(): TopPage[] {
  return [
    { page: "https://www.century-plaza.com/", clicks: 450, impressions: 8200, ctr: 5.5, position: 12.3 },
    { page: "https://www.century-plaza.com/extended-stay", clicks: 320, impressions: 5400, ctr: 5.9, position: 8.7 },
    { page: "https://www.century-plaza.com/corporate-housing", clicks: 180, impressions: 3100, ctr: 5.8, position: 15.2 },
    { page: "https://www.century-plaza.com/blog/extended-stay-tips", clicks: 150, impressions: 4200, ctr: 3.6, position: 18.4 },
    { page: "https://www.century-plaza.com/contact", clicks: 120, impressions: 2000, ctr: 6.0, position: 10.1 },
    { page: "https://www.century-plaza.com/medical-stays", clicks: 95, impressions: 1800, ctr: 5.3, position: 14.5 },
    { page: "https://www.century-plaza.com/blog/local-seo", clicks: 88, impressions: 3500, ctr: 2.5, position: 22.1 },
  ];
}

function getPlaceholderKeywords(): KeywordRanking[] {
  const keywords = [
    "extended stay apartments", "corporate housing los angeles", "furnished apartments LA",
    "monthly rentals near me", "long term hotel stay", "executive suites los angeles",
    "temporary housing", "short term lease apartments", "business travel housing",
    "relocation apartments LA", "medical stay housing", "insurance housing los angeles",
    "pet friendly furnished apartments", "studio apartments monthly rent",
    "luxury corporate apartments", "all inclusive apartments LA",
    "serviced apartments los angeles", "weekly hotel rates LA", "travel nurse housing",
    "furnished rentals downtown LA",
  ];
  return keywords.map((kw, i) => {
    const current = 5 + ((i * 7 + 3) % 40);
    const change = ((i * 3 + 1) % 9) - 3;
    return {
      id: `kw-${i}`,
      keyword: kw,
      currentPosition: current,
      previousPosition: current - change,
      change,
      searchVolume: 500 + ((i * 311) % 4500),
    };
  });
}

function getPlaceholderGoals(): QuarterlyGoal[] {
  return [
    { id: "g1", goal: "Increase organic traffic by 20%", icon: "\uD83D\uDCC8", targetMetric: "20% traffic increase (2,500 \u2192 3,000 sessions/mo)", progress: 65, quarter: "Q1 2026" },
    { id: "g2", goal: "Rank for 'corporate housing los angeles'", icon: "\uD83C\uDFAF", targetMetric: "Page 1 ranking (currently #14)", progress: 40, quarter: "Q1 2026" },
  ];
}

function getPlaceholderWorkLog(): WorkLogEntry[] {
  return [
    { id: "w1", task: "Published blog: 'Top 10 Extended Stay Tips for Business Travelers'", category: ["Content"], subtasks: "Keyword research, drafting, meta tags, internal links, featured image", deliverableLinks: ["https://century-plaza.com/blog/extended-stay-tips"], monthlySummary: "", month: "2026-03-01", isPlan: false },
    { id: "w2", task: "Optimized Extended Stay landing page for target keywords", category: ["On-Page SEO"], subtasks: "Rewrote H1, updated title tag & meta description, added FAQ schema, improved internal linking structure", deliverableLinks: [], monthlySummary: "", month: "2026-03-01", isPlan: false },
    { id: "w3", task: "Resolved Core Web Vitals issues flagged in PageSpeed", category: ["Technical"], subtasks: "Compressed 23 images, implemented lazy loading, fixed CLS on mobile hero section", deliverableLinks: [], monthlySummary: "This month we focused on content creation and technical health. The new blog post is already ranking for 3 target keywords within the first week. Extended Stay page saw a 15% click increase after on-page optimizations.", month: "2026-03-01", isPlan: false },
  ];
}

function getPlaceholderPlan(): WorkLogEntry[] {
  return [
    { id: "p1", task: "Publish blog targeting 'medical stay apartments in LA'", category: ["Content"], subtasks: "Keyword research, content brief, draft, on-page optimization, publish", deliverableLinks: [], monthlySummary: "", month: "2026-04-01", isPlan: true },
    { id: "p2", task: "Optimize Medical Stays page for conversion", category: ["On-Page SEO"], subtasks: "Add FAQ schema, improve CTAs, update meta tags, internal linking from blog", deliverableLinks: [], monthlySummary: "", month: "2026-04-01", isPlan: true },
    { id: "p3", task: "Reddit & community outreach for backlinks", category: ["Link Building"], subtasks: "Identify 5 relevant threads, create helpful responses linking to resources", deliverableLinks: [], monthlySummary: "", month: "2026-04-01", isPlan: true },
  ];
}

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
function loadEnrichedContent(slug: string): any | null {
  try {
    const filePath = path.join(process.cwd(), "data", `enriched-${slug}.json`);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
}

function getCurrentQuarter(): string {
  const now = new Date();
  return `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`;
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

  let client: ClientConfig | null;
  let goals: QuarterlyGoal[];
  let workLog: WorkLogEntry[];
  let plan: WorkLogEntry[];
  let historicalMonths: string[] = [];
  let workLogsByMonth: Record<string, WorkLogEntry[]> = {};
  let summariesByMonth: Record<string, string> = {};
  let metricsByMonth: Record<string, { sessions?: number; impressions?: number; notableWins?: string[] }> = {};

  // Try to get client from Notion database first, then fallback to placeholder
  client = await getClientBySlug(slug);
  if (!client) {
    client = getPlaceholderClient(slug);
  }
  if (!client) notFound();

  // Try enriched content (from AI pipeline)
  const enriched = loadEnrichedContent(slug);

  if (enriched) {

    goals = (enriched.goals || []).map((g: { goal: string; icon: string; targetMetric: string; progress: number; deadline: string }, i: number) => ({
      id: `eg-${i}`,
      goal: g.goal,
      icon: g.icon || "\uD83C\uDFAF",
      targetMetric: g.targetMetric,
      progress: g.progress || 0,
      quarter: g.deadline || getCurrentQuarter(),
    }));

    workLog = (enriched.currentMonth?.tasks || []).map((t: { task: string; category: string[]; subtasks: string; deliverableLinks: string[] }, i: number) => ({
      id: `et-${i}`,
      task: t.task,
      category: t.category || [],
      subtasks: t.subtasks || "",
      deliverableLinks: t.deliverableLinks || [],
      monthlySummary: i === 0 ? (enriched.currentMonth?.summary || "") : "",
      month: getCurrentMonth(),
      isPlan: false,
    }));

    plan = [];

    // Build historical months from enriched pastMonths
    if (enriched.pastMonths?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      enriched.pastMonths.forEach((pm: any, mi: number) => {
        // Use the label as a pseudo-date key
        const monthKey = pm.label || `past-${mi}`;
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
        if (pm.summary) {
          summariesByMonth[monthKey] = pm.summary;
        }
        if (pm.metrics) {
          metricsByMonth[monthKey] = pm.metrics;
        }
      });
    } else {
      historicalMonths = [];
      workLogsByMonth = {};
      summariesByMonth = {};
    }
  } else {
    // No enriched content — use placeholder data
    goals = getPlaceholderGoals();
    workLog = getPlaceholderWorkLog();
    plan = getPlaceholderPlan();
    historicalMonths = ["2026-02-01", "2026-01-01", "2025-12-01"];
  }

  let kpis: KPIData[] = [];
  let usersTimeSeries: TimeSeriesPoint[] = [];
  let trafficChannels: TrafficChannel[] = [];
  let topPages: TopPage[] = [];
  let keywords: KeywordRanking[] = [];
  let analyticsConnected = false;

  if (USE_GOOGLE && client.gscSiteUrl && client.ga4PropertyId) {
    try {
      const { startDate, endDate } = getDateRange("28d");

      const [gscKpis, ga4Kpis, usersTs, channels, gscTopPages] = await Promise.all([
        getGSCKPIs(client.gscSiteUrl, "28d"),
        getGA4KPIs(client.ga4PropertyId),
        getGA4UsersTimeSeries(client.ga4PropertyId, startDate, endDate),
        getGA4TrafficAcquisition(client.ga4PropertyId, startDate, endDate),
        getGSCTopPages(client.gscSiteUrl, startDate, endDate, 10),
      ]);

      kpis = [
        gscKpis.clicks,
        gscKpis.impressions,
        {
          label: "CTR",
          value: gscKpis.clicks.value && gscKpis.impressions.value
            ? (gscKpis.clicks.value / gscKpis.impressions.value) * 100
            : 0,
          previousValue: 0,
          changePercent: 0,
          format: "percent",
        },
        ga4Kpis.organicSessions,
      ];

      usersTimeSeries = usersTs;
      trafficChannels = channels;
      topPages = gscTopPages;
      keywords = getPlaceholderKeywords(); // SE Rankings not connected yet
      analyticsConnected = true;
    } catch (error) {
      console.error("Failed to fetch live analytics:", error);
    }
  }

  // When not connected, use placeholder data as blurred visual backdrop only
  if (!analyticsConnected) {
    kpis = getPlaceholderKPIs();
    topPages = getPlaceholderTopPages();
    keywords = getPlaceholderKeywords();
  }

  const summary = workLog.find((e) => e.monthlySummary)?.monthlySummary || "";
  const quarter = getCurrentQuarter();
  const currentMonthLabel = formatMonthLabel(getCurrentMonth());
  const nextMonthLabel = formatMonthLabel(getNextMonth());

  // Determine if current month work is complete (all tasks done)
  const allComplete = workLog.length > 0 && workLog.every((e) => !e.isPlan);

  // Upcoming months — from enriched data or placeholder
  let upcomingMonths: { monthLabel: string; entries: WorkLogEntry[]; summary?: string }[];

  if (enriched?.upcomingMonths?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    upcomingMonths = enriched.upcomingMonths.map((m: any, mi: number) => ({
      monthLabel: m.monthLabel,
      summary: m.summary,
      // Handle tasks being strings or objects
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
    upcomingMonths = [
      {
        monthLabel: nextMonthLabel,
        entries: plan,
        summary: "Content + on-page optimization targeting medical stays",
      },
      {
        monthLabel: formatMonthLabel(getFutureMonth(2)),
        entries: [
          { id: "u1", task: "Publish blog targeting 'relocation apartments LA'", category: ["Content"], subtasks: "", deliverableLinks: [] as string[], monthlySummary: "", month: getFutureMonth(2), isPlan: true },
          { id: "u2", task: "Site speed audit & optimization pass", category: ["Technical"], subtasks: "", deliverableLinks: [] as string[], monthlySummary: "", month: getFutureMonth(2), isPlan: true },
        ],
        summary: "Relocation content push + technical performance audit",
      },
      {
        monthLabel: formatMonthLabel(getFutureMonth(3)),
        entries: [
          { id: "u3", task: "Publish blog targeting 'corporate housing benefits'", category: ["Content"], subtasks: "", deliverableLinks: [] as string[], monthlySummary: "", month: getFutureMonth(3), isPlan: true },
          { id: "u4", task: "Internal linking restructure", category: ["On-Page SEO"], subtasks: "", deliverableLinks: [] as string[], monthlySummary: "", month: getFutureMonth(3), isPlan: true },
          { id: "u5", task: "Quarterly keyword research refresh", category: ["Strategy"], subtasks: "", deliverableLinks: [] as string[], monthlySummary: "", month: getFutureMonth(3), isPlan: true },
        ],
        summary: "Corporate housing content + Q2 keyword strategy refresh",
      },
    ];
  }

  return (
    <div className="min-h-screen bg-white">
      <Header client={client} />

      {/* ── 1. Goals: orange container ── */}
      <div className="max-w-3xl mx-auto px-6 pt-4">
        <GoalsSection goals={goals} quarter={quarter} />
      </div>

      {/* ── 2. This Month ── */}
      <div className="max-w-3xl mx-auto px-6 py-6">
        <WorkLog
          entries={workLog}
          summary={summary}
          monthLabel={currentMonthLabel}
          isComplete={allComplete && !!summary}
          goalSummary={
            !summary
              ? (enriched?.currentMonth?.strategy || `This month we're focused on driving organic growth through content creation, on-page optimization, and technical improvements aligned with our Q1 goals.`)
              : undefined
          }
        />
      </div>

      {/* ── 3. Metrics: light blue container ── */}
      <div className="max-w-3xl mx-auto px-6 pb-4">
        <div className="bg-[#FAFCFF] rounded-2xl px-8 py-6">
          <MetricsSection
            initialKpis={kpis}
            initialUsersTimeSeries={usersTimeSeries}
            initialTrafficChannels={trafficChannels}
            initialTopPages={topPages}
            initialKeywords={keywords}
            clientSlug={slug}
            initialRange="28d"
          />
        </div>
      </div>

      {/* ── 4. Upcoming Months: green container ── */}
      <div className="max-w-3xl mx-auto px-6 pt-2 pb-4">
        <UpcomingMonths monthPlans={upcomingMonths} />
      </div>

      {/* ── 5. Past Months: purple container ── */}
      <div className="max-w-3xl mx-auto px-6 pb-4">
        <HistoricalReports
          months={historicalMonths}
          workLogsByMonth={workLogsByMonth}
          summariesByMonth={summariesByMonth}
          metricsByMonth={metricsByMonth}
          clientSlug={slug}
        />
      </div>

      <Footer />
      <ClientDashboardTracker slug={slug} />
    </div>
  );
}
