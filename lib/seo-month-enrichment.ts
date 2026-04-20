import Anthropic from "@anthropic-ai/sdk";
import { ClientConfig } from "@/types";
import {
  EnrichedMonth,
  EnrichedTask,
  ChartHint,
  EnrichedGoal,
} from "@/types/enrichment";
import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { tiptapToMarkdown } from "./tiptap-to-markdown";
import { getGA4TimeSeries } from "./ga4";
import { getGSCTimeSeries } from "./gsc";
import { getLangfuse } from "./langfuse";
import {
  SeoStrategyMonth,
  hashContent,
  parseMonthKey,
} from "./seo-strategy-months";
import { getClientById } from "./clients";
import type { Id } from "@/convex/_generated/dataModel";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface SingleMonthOutput {
  monthLabel: string;
  summary: string;
  strategy: string;
  tasks: EnrichedTask[];
  isComplete: boolean;
  leads?: number;
  goals: EnrichedGoal[];
  approvals: Array<{ title: string; description: string; links: Array<{ url: string; label: string }> }>;
  chartHints: ChartHint[];
  metrics?: { sessions?: number; impressions?: number; notableWins?: string[] };
}

const SYSTEM_PROMPT = `You are a content processor for an SEO agency's client dashboard. You receive raw team notes for ONE month of strategy work and structure it into JSON.

CRITICAL RULES:
- NEVER invent content not in the source notes.
- Each checkbox (- [x] / - [ ]) becomes its own task. Preserve every checkbox.
- Subtasks under a checkbox go in the "subtasks" array as objects { text, completed, link, linkLabel }.
- "completed" reflects [x] vs [ ].
- Keep original wording — only fix typos and casing.
- Categorize each task: Content, On-Page SEO, Technical, Link Building, Analytics, or Strategy.
- Add a 1-sentence "impact" per task.
- Extract approvals (items needing client sign-off) with associated links.

CHART HINTS:
When a task or summary contains a metric claim ("grew traffic 12%", "402 clicks in Q1", "ranked #1 for X"), emit a chartHint:
{
  "bulletId": "stable-id-of-task",   // use the task text shortened to a slug
  "metric": "ga4_organic_sessions" | "gsc_clicks" | "gsc_impressions" | "se_ranking_position",
  "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "keyword": "optional keyword",
  "page": "optional page path",
  "caption": "short label like 'Organic sessions Jan 1–15'"
}
Only emit when a date range can be inferred. If the bullet says "this month" use the month being processed. Skip image-only bullets.

Return ONLY valid JSON in this shape:
{
  "monthLabel": "April 2026",
  "summary": "2-3 sentence summary",
  "strategy": "1-2 sentence strategic focus",
  "tasks": [{ "task": "...", "completed": true, "category": ["..."], "subtasks": [], "deliverableLinks": [], "impact": "..." }],
  "isComplete": false,
  "leads": null,
  "goals": [{ "goal": "...", "icon": "📈", "targetMetric": "...", "progress": 0, "deadline": "...", "targetMetricType": "organic_sessions", "targetValue": 1000 }],
  "approvals": [{ "title": "...", "description": "...", "links": [{ "url": "...", "label": "..." }] }],
  "chartHints": [],
  "metrics": { "sessions": null, "impressions": null, "notableWins": [] }
}`;

async function callClaudeForMonth(
  markdown: string,
  client: ClientConfig,
  monthLabel: string,
  parentTraceId?: string
): Promise<SingleMonthOutput> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt = `Client: ${client.name} (website: ${client.gscSiteUrl || "n/a"})
Month: ${monthLabel}

Process these notes for ${monthLabel} and return structured JSON:

---
${markdown}
---`;

  const langfuse = getLangfuse();
  const generation = langfuse.generation({
    traceId: parentTraceId,
    name: "seo-month-enrichment",
    model: "claude-sonnet-4-20250514",
    modelParameters: { max_tokens: 8192 },
    input: { system: SYSTEM_PROMPT, user: userPrompt },
    metadata: { client: client.slug, month: monthLabel, inputChars: markdown.length },
  });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  generation.end({
    output: text,
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      total: response.usage.input_tokens + response.usage.output_tokens,
      unit: "TOKENS" as const,
    },
  });

  let jsonStr = text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  return JSON.parse(jsonStr) as SingleMonthOutput;
}

async function resolveChartHint(
  hint: ChartHint,
  client: ClientConfig
): Promise<ChartHint> {
  try {
    const { start, end } = hint.dateRange;
    if (!start || !end) return hint;

    let series: Array<{ date: string; value: number }> = [];

    if (hint.metric === "ga4_organic_sessions" && client.ga4PropertyId) {
      const points = await getGA4TimeSeries(
        `properties/${client.ga4PropertyId}`,
        start,
        end
      );
      series = points.map((p) => ({
        date: p.date as string,
        value: ((p as unknown) as { organicSessions: number }).organicSessions ?? 0,
      }));
    } else if (
      (hint.metric === "gsc_clicks" || hint.metric === "gsc_impressions") &&
      client.gscSiteUrl
    ) {
      const points = await getGSCTimeSeries(client.gscSiteUrl, start, end);
      series = points.map((p) => {
        const value =
          hint.metric === "gsc_clicks"
            ? ((p as unknown) as { clicks: number }).clicks
            : ((p as unknown) as { impressions: number }).impressions;
        return { date: p.date as string, value: value ?? 0 };
      });
    }

    return { ...hint, series };
  } catch (error) {
    console.error("Failed to resolve chart hint", hint, error);
    return hint;
  }
}

function applyChartHintsToTasks(tasks: EnrichedTask[], hints: ChartHint[]): EnrichedTask[] {
  if (!hints.length) return tasks;
  return tasks.map((t) => {
    const slug = t.task.toLowerCase().slice(0, 60);
    const matched = hints.filter(
      (h) =>
        h.bulletId &&
        (h.bulletId.toLowerCase().includes(slug.slice(0, 30)) ||
          slug.includes(h.bulletId.toLowerCase().slice(0, 30)))
    );
    return matched.length ? { ...t, chartHints: matched } : t;
  });
}

interface MergeOptions {
  monthKey: string;
  status: "active" | "complete" | "forecast";
  output: SingleMonthOutput;
}

async function mergeIntoEnrichedContent(
  client: ClientConfig,
  { monthKey, status, output }: MergeOptions
): Promise<void> {
  const convex = getConvexClient();
  const latest = await convex.query(api.enrichedContent.getLatest, {
    clientSlug: client.slug,
  });

  const existingData =
    (latest?.enrichedData as Record<string, unknown> | undefined) ?? {};

  const monthDoc: EnrichedMonth & { isComplete?: boolean; chartHints?: ChartHint[] } = {
    monthLabel: output.monthLabel,
    summary: output.summary,
    tasks: output.tasks,
    leads: output.leads,
    metrics: output.metrics,
  };

  let newData: Record<string, unknown>;

  if (status === "active") {
    newData = {
      ...existingData,
      currentMonth: {
        label: output.monthLabel,
        summary: output.summary,
        strategy: output.strategy,
        tasks: output.tasks,
        isComplete: output.isComplete,
        leads: output.leads,
      },
      goals: output.goals.length ? output.goals : existingData.goals ?? [],
      approvals: output.approvals,
      processedAt: new Date().toISOString(),
    };
  } else {
    const pastMonths = ((existingData.pastMonths as EnrichedMonth[]) || []).filter(
      (m) => m.monthLabel !== output.monthLabel
    );
    pastMonths.unshift(monthDoc as EnrichedMonth);
    newData = {
      ...existingData,
      pastMonths,
      processedAt: new Date().toISOString(),
    };
  }

  // Always write to the canonical "latest" row for this client so the
  // dashboard (which reads via getLatest) sees the cumulative state.
  // Without this, each per-month enrichment writes into its own
  // (clientSlug, month) row and only the highest-month row is read,
  // dropping every other month's pastMonths update.
  const canonicalMonth =
    latest?.month ??
    (() => {
      const { year, month } = parseMonthKey(monthKey);
      return `${year}-${String(month).padStart(2, "0")}-01`;
    })();

  await convex.mutation(api.enrichedContent.upsert, {
    clientSlug: client.slug,
    month: canonicalMonth,
    rawContent: latest?.rawContent ?? "",
    enrichedData: newData as unknown,
  });
}

export async function enrichSeoStrategyMonth(monthRow: SeoStrategyMonth): Promise<void> {
  const convex = getConvexClient();
  const client = await getClientById(monthRow.clientId);
  if (!client) throw new Error(`Client ${monthRow.clientId} not found`);

  const markdown = tiptapToMarkdown(monthRow.rawContent);
  if (!markdown.trim()) {
    await convex.mutation(api.seoStrategyMonths.recordEnrichmentResult, {
      id: monthRow.id as Id<"seoStrategyMonths">,
      success: true,
      enrichedHash: monthRow.rawContentHash,
    });
    return;
  }

  const monthLabel = `${MONTH_NAMES[monthRow.month - 1]} ${monthRow.year}`;
  const langfuse = getLangfuse();
  const trace = langfuse.trace({
    name: "seo-month-enrichment",
    metadata: { client: client.slug, monthKey: monthRow.monthKey },
  });

  try {
    const output = await callClaudeForMonth(markdown, client, monthLabel, trace.id);

    if (output.chartHints?.length) {
      const resolved = await Promise.all(
        output.chartHints.map((h) => resolveChartHint(h, client))
      );
      output.chartHints = resolved;
      output.tasks = applyChartHintsToTasks(output.tasks, resolved);
    }

    const status =
      monthRow.status === "forecast"
        ? "active" // promote to active once we have content
        : monthRow.status;

    await mergeIntoEnrichedContent(client, {
      monthKey: monthRow.monthKey,
      status,
      output,
    });

    await convex.mutation(api.seoStrategyMonths.recordEnrichmentResult, {
      id: monthRow.id as Id<"seoStrategyMonths">,
      success: true,
      enrichedHash: monthRow.rawContentHash,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enrichment failed";
    console.error("seo-month-enrichment failed", monthRow.monthKey, message);
    await convex.mutation(api.seoStrategyMonths.recordEnrichmentResult, {
      id: monthRow.id as Id<"seoStrategyMonths">,
      success: false,
      error: message,
    });
    throw error;
  }
}

export { hashContent };
