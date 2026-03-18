import Anthropic from "@anthropic-ai/sdk";
import { ClientConfig } from "@/types";
import {
  ClaudeStructuredOutput,
  EnrichedContent,
  AnalyticsEnrichment,
} from "@/types/enrichment";
import { getGSCPerformance, getGSCTimeSeries, getDateRange } from "./gsc";
import { getGA4Sessions } from "./ga4";
import { upsertApproval } from "./db";
import crypto from "crypto";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a content processor for an SEO agency's client dashboard. You receive raw team notes from a Notion page and must extract and structure them into JSON.

CRITICAL RULES — READ FIRST:
- NEVER invent, fabricate, or add content that is not in the source notes. Every task, detail, and link in your output MUST come directly from the notes. If something is not mentioned, do not include it.
- PRESERVE EVERY CHECKBOX — each checkbox (- [x] or - [ ]) in the notes MUST become its own separate task in the tasks array. Do NOT merge, combine, or summarize multiple checkboxes into one task. If the notes have 25 checkboxes, the output MUST have 25 tasks.
- Nested bullets under a checkbox are that task's subtasks/details — include them in the "subtasks" field, not as separate tasks.
- Use the EXACT task text from the notes. You may clean up grammar slightly but do NOT rewrite, rename, or paraphrase tasks. "Optimize meta titles and descriptions for better CTR" stays as "Optimize meta titles and descriptions for better CTR" — not "Optimize Blog".
- LINKS ARE CRITICAL — any URL found in nested bullets under a checkbox (like Google Sheets links, Google Docs links, or any https:// URL) MUST go in that task's "deliverableLinks" array. Scan every nested bullet for [text](url) markdown links and bare https:// URLs. Never drop a link. If a checkbox like "SEO Fixes" has a sub-item "[Click Here For Meta Descriptions](https://docs.google.com/...)", that URL goes in deliverableLinks for that task.

Your job:
1. STRUCTURE the content into current month work, past months, goals, and upcoming months
2. LIGHTLY POLISH grammar only — fix typos and capitalization. Keep the original wording. Do NOT rewrite or paraphrase.
3. DETECT ENTITIES — identify any specific page URLs (like /blog, /services, https://...), keywords (like "corporate housing LA"), and metric claims (like "10% traffic increase")
4. For tasks, categorize them into: Content, On-Page SEO, Technical, Link Building, Analytics, or Strategy
5. For each task, add an "impact" field — one brief sentence explaining WHY this task matters for the business
6. For goals, add "targetMetricType" (one of: "sessions", "organic_sessions", "clicks", "impressions", "keywords_page1", "leads") and "targetValue" (the numeric target). Use "sessions" for total traffic goals, "organic_sessions" for organic-only.
7. Extract lead counts — if the notes mention leads (e.g. "Leads: 12"), include a "leads" field in currentMonth with the numeric count.
8. Detect APPROVAL REQUESTS — items needing client approval (e.g. "Client Approval:", "Needs Approval:", "Pending client review").

Return ONLY valid JSON matching this structure:
{
  "currentMonth": {
    "label": "March 2026",
    "summary": "2-3 sentence summary of what was accomplished or is in progress this month",
    "strategy": "1-2 sentence description of the strategic focus this month",
    "tasks": [
      {
        "task": "exact task text from checkbox",
        "category": ["On-Page SEO"],
        "subtasks": "nested bullet details under this checkbox, if any",
        "deliverableLinks": ["https://exact-url-from-notes.com"],
        "impact": "one sentence on why this task matters"
      }
    ],
    "isComplete": false,
    "leads": null
  },
  "goals": [
    {
      "goal": "goal description from notes",
      "icon": "📈",
      "targetMetric": "specific target from notes",
      "progress": 0,
      "deadline": "deadline from notes",
      "targetMetricType": "organic_sessions",
      "targetValue": 1000
    }
  ],
  "pastMonths": [
    {
      "monthLabel": "February 2026",
      "summary": "2-3 sentence summary from notes",
      "tasks": [{ "task": "...", "category": ["..."], "subtasks": "", "deliverableLinks": [], "impact": "..." }],
      "leads": null,
      "metrics": {
        "sessions": null,
        "impressions": null,
        "notableWins": ["achievement mentioned in notes"]
      }
    }
  ],
  "upcomingMonths": [
    {
      "monthLabel": "April 2026",
      "summary": "strategy mentioned in notes",
      "tasks": [{ "task": "...", "category": ["..."], "subtasks": "", "deliverableLinks": [], "impact": "..." }]
    }
  ],
  "detectedEntities": {
    "pages": ["/blog", "https://www.example.com/page"],
    "keywords": ["target keyword from notes"],
    "metrics": [
      {
        "claim": "exact metric claim from notes",
        "metricType": "traffic",
        "pageUrl": "/blog",
        "value": "10%",
        "direction": "increase"
      }
    ]
  },
  "approvals": [
    {
      "title": "approval title from notes",
      "description": "approval details from notes"
    }
  ]
}

Rules:
- NEVER add tasks, goals, metrics, or content that is not in the source notes
- If no goals are mentioned, return an empty goals array
- Extract ALL past/previous months mentioned in the notes into the pastMonths array. Order most recent first.
- If no past months are mentioned, return an empty pastMonths array
- If no upcoming months are mentioned, return an empty upcomingMonths array
- Set isComplete to true only if the notes clearly indicate all work is done for the month
- Detect ALL page URLs mentioned (even partial paths like /blog)
- Detect ALL keywords that appear to be SEO target keywords
- Detect ALL metric claims (traffic changes, ranking changes, conversion mentions)
- Use appropriate emoji icons for goals
- Estimate progress percentage for goals based on context clues (default to 0 if unclear)
- For goals, parse targetMetricType and targetValue from the target text
- For leads, set to null if not mentioned
- For approvals, extract only explicit approval requests. If none found, return empty array
- Return ONLY the JSON, no markdown wrapping, no explanation`;

/**
 * Process raw Notion markdown through Claude to get structured output
 */
async function callClaude(
  rawMarkdown: string,
  client: ClientConfig
): Promise<ClaudeStructuredOutput> {
  const userPrompt = `Here are the raw team notes for client "${client.name}" (website: ${client.gscSiteUrl}).

Process these notes and return structured JSON:

---
${rawMarkdown}
---`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  // Parse JSON — handle potential markdown wrapping
  let jsonStr = text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  return JSON.parse(jsonStr) as ClaudeStructuredOutput;
}

/**
 * Fetch analytics data for detected entities
 */
async function fetchAnalyticsForEntities(
  structured: ClaudeStructuredOutput,
  client: ClientConfig
): Promise<AnalyticsEnrichment[]> {
  const enrichments: AnalyticsEnrichment[] = [];
  const { startDate, endDate } = getDateRange("3m");

  // Enrich detected pages
  for (const pagePath of structured.detectedEntities.pages) {
    try {
      // Build full URL if it's a path
      const fullUrl = pagePath.startsWith("http")
        ? pagePath
        : `${client.gscSiteUrl.replace("sc-domain:", "https://")}${pagePath}`;

      const perf = await getGSCPerformance(
        client.gscSiteUrl,
        startDate,
        endDate
      );

      // Try to get page-specific time series
      const timeSeries = await getGSCTimeSeries(
        client.gscSiteUrl,
        startDate,
        endDate
      );

      enrichments.push({
        entityType: "page",
        entity: pagePath,
        data: {
          clicks: perf.clicks,
          impressions: perf.impressions,
          timeSeries: timeSeries.slice(-30).map((p) => ({
            date: p.date,
            value: p.clicks || 0,
          })),
        },
      });
    } catch {
      // Skip if analytics fetch fails for this entity
    }
  }

  // Enrich detected metrics with actual GA4 data
  for (const metric of structured.detectedEntities.metrics) {
    if (metric.metricType === "traffic" || metric.metricType === "sessions") {
      try {
        const now = new Date();
        const sessions = await getGA4Sessions(
          client.ga4PropertyId,
          new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0],
          now.toISOString().split("T")[0]
        );

        enrichments.push({
          entityType: "metric",
          entity: metric.claim,
          data: {
            sessions: sessions.organicSessions,
            changePercent: 0, // Would need prior period to calculate
          },
        });
      } catch {
        // Skip
      }
    }
  }

  return enrichments;
}

/**
 * Full enrichment pipeline: Notion markdown → Claude → Analytics → EnrichedContent
 *
 * Options:
 * - taskCompletion: checkbox counts from Notion blocks
 * - mode: "full" processes entire markdown, "current-month" only processes current month section
 * - existingData: when mode is "current-month", merge new currentMonth into this existing data
 */
export async function enrichClientContent(
  rawMarkdown: string,
  client: ClientConfig,
  options?: {
    taskCompletion?: { completed: number; total: number };
    mode?: "full" | "current-month";
    existingData?: EnrichedContent;
  }
): Promise<EnrichedContent> {
  const { taskCompletion, mode = "full", existingData } = options || {};

  // Step 1: Get structured output from Claude
  const structured = await callClaude(rawMarkdown, client);

  // Step 2: Fetch analytics for detected entities
  const analyticsEnrichments = await fetchAnalyticsForEntities(structured, client);

  // Step 3: Upsert any approval requests to DB
  if (structured.approvals?.length) {
    for (const approval of structured.approvals) {
      await upsertApproval(client.slug, approval.title, approval.description);
    }
  }

  // Step 4: Combine into final enriched content
  const contentHash = crypto
    .createHash("md5")
    .update(rawMarkdown)
    .digest("hex");

  // Step 5: Build result — merge with existing data if current-month mode
  const baseData = mode === "current-month" && existingData
    ? {
        ...existingData,
        currentMonth: structured.currentMonth,
        detectedEntities: structured.detectedEntities,
        approvals: structured.approvals || existingData.approvals,
      }
    : { ...structured };

  return {
    ...baseData,
    currentMonth: {
      ...baseData.currentMonth,
      ...(taskCompletion ? { taskCompletion } : {}),
    },
    analyticsEnrichments: mode === "current-month" && existingData
      ? [...(existingData.analyticsEnrichments || []), ...analyticsEnrichments]
      : analyticsEnrichments,
    processedAt: new Date().toISOString(),
    rawContentHash: contentHash,
  };
}
