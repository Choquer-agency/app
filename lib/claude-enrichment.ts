import Anthropic from "@anthropic-ai/sdk";
import { ClientConfig } from "@/types";
import {
  ClaudeStructuredOutput,
  EnrichedContent,
  EnrichedMonth,
  AnalyticsEnrichment,
} from "@/types/enrichment";
import { getGSCPerformance, getGSCTimeSeries, getDateRange } from "./gsc";
import { getGA4Sessions } from "./ga4";
import { upsertApproval } from "./db";
import { splitAllMonthSections } from "./notion-pages";
import { getLangfuse, flushLangfuse } from "./langfuse";
import crypto from "crypto";

const MULTIPASS_MONTH_THRESHOLD = 10;
const HISTORY_BATCH_SIZE = 8;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a content processor for an SEO agency's client dashboard. You receive raw team notes from a Notion page and must extract and structure them into JSON.

CRITICAL RULES — READ FIRST:
- NEVER invent, fabricate, or add content that is not in the source notes. Every task, detail, and link in your output MUST come directly from the notes. If something is not mentioned, do not include it.
- PRESERVE EVERY CHECKBOX — each checkbox (- [x] or - [ ]) in the notes MUST become its own separate task in the tasks array. Do NOT merge, combine, or summarize multiple checkboxes into one task. If the notes have 25 checkboxes, the output MUST have 25 tasks.
- Nested bullets under a checkbox are that task's subtasks — include them in the "subtasks" array, NOT as separate tasks. Each subtask is an object with "text" (the subtask description), "completed" (true if the nested item has [x], false if [ ] or no checkbox), "link" (URL if the subtask has one, otherwise null), and "linkLabel" (the display text for the link, e.g. if the note says "[Click Here For Meta Descriptions](https://...)", linkLabel is "Click Here For Meta Descriptions"). If a checkbox has no nested bullets, set subtasks to an empty array [].
- Use the EXACT task text from the notes. You may clean up grammar slightly but do NOT rewrite, rename, or paraphrase tasks. "Optimize meta titles and descriptions for better CTR" stays as "Optimize meta titles and descriptions for better CTR" — not "Optimize Blog".
- SET "completed" per task — if the checkbox is [x] (checked), set completed: true. If [ ] (unchecked), set completed: false. This determines whether a checkmark or empty circle shows on the dashboard.
- LINKS ARE CRITICAL — any URL found in nested bullets under a checkbox (like Google Sheets links, Google Docs links, or any https:// URL) MUST go in that task's "deliverableLinks" array. Scan every nested bullet for [text](url) markdown links and bare https:// URLs. Never drop a link. If a checkbox like "SEO Fixes" has a sub-item "[Click Here For Meta Descriptions](https://docs.google.com/...)", that URL goes in deliverableLinks for that task.

Your job:
1. STRUCTURE the content into current month work, past months, goals, and upcoming months
2. LIGHTLY POLISH grammar only — fix typos and capitalization. Keep the original wording. Do NOT rewrite or paraphrase.
3. DETECT ENTITIES — identify any specific page URLs (like /blog, /services, https://...), keywords (like "corporate housing LA"), and metric claims (like "10% traffic increase")
4. For tasks, categorize them into: Content, On-Page SEO, Technical, Link Building, Analytics, or Strategy
5. For each task, add an "impact" field — one brief sentence explaining WHY this task matters for the business
6. For goals, add "targetMetricType" (one of: "sessions", "organic_sessions", "clicks", "impressions", "keywords_page1", "leads") and "targetValue" (the numeric target). Use "sessions" for total traffic goals, "organic_sessions" for organic-only.
7. Extract lead counts — if the notes mention leads (e.g. "Leads: 12"), include a "leads" field in currentMonth with the numeric count.
8. Detect APPROVAL REQUESTS — items needing client approval (e.g. "Client Approval:", "Needs Approval:", "Pending client review"). IMPORTANT: Extract ALL links/URLs associated with each approval — these are resources the client needs to review before approving (e.g. design mockups, keyword lists, documents). Include them in the "links" array with the URL and a descriptive label.

Return ONLY valid JSON matching this structure:
{
  "currentMonth": {
    "label": "March 2026",
    "summary": "2-3 sentence summary of what was accomplished or is in progress this month",
    "strategy": "1-2 sentence description of the strategic focus this month",
    "tasks": [
      {
        "task": "exact task text from checkbox",
        "completed": true,
        "category": ["On-Page SEO"],
        "subtasks": [
          { "text": "subtask text from nested bullet", "completed": true, "link": "https://url-if-present.com", "linkLabel": "Click Here For Report" },
          { "text": "another subtask", "completed": false, "link": null, "linkLabel": null }
        ],
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
      "tasks": [{ "task": "...", "category": ["..."], "subtasks": [], "deliverableLinks": [], "impact": "..." }],
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
      "tasks": [{ "task": "...", "category": ["..."], "subtasks": [], "deliverableLinks": [], "impact": "..." }]
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
      "description": "approval details from notes",
      "links": [{ "url": "https://...", "label": "Review Document" }]
    }
  ]
}

Rules:
- NEVER add tasks, goals, metrics, or content that is not in the source notes
- If no goals are mentioned, return an empty goals array
- Extract ALL past/previous months mentioned in the notes into the pastMonths array. Order most recent first. Past month tasks follow the SAME rules as current month tasks: preserve every checkbox, use structured subtasks arrays with completed/link/linkLabel, include ALL URLs and deliverable links. Do NOT drop links from past months.
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
- For approvals, extract only explicit approval requests. If none found, return empty array. Always include any links/URLs found near the approval request in the "links" array — these are what the client needs to review before they can approve
- Return ONLY the JSON, no markdown wrapping, no explanation`;

/**
 * Process raw Notion markdown through Claude to get structured output.
 * Options:
 * - maxTokens: override default 16384 output token limit
 * - skipPastMonths: when true, instructs Claude to return empty pastMonths (for multi-pass)
 */
async function callClaude(
  rawMarkdown: string,
  client: ClientConfig,
  options?: { maxTokens?: number; skipPastMonths?: boolean },
  parentTraceId?: string
): Promise<ClaudeStructuredOutput> {
  const { maxTokens = 16384, skipPastMonths = false } = options || {};
  const now = new Date();
  const currentMonthLabel = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  const skipInstruction = skipPastMonths
    ? `\n\nIMPORTANT: Return an EMPTY pastMonths array []. Past months will be processed separately. Focus your output on currentMonth, goals, upcomingMonths, detectedEntities, and approvals only.`
    : "";

  const userPrompt = `Here are the raw team notes for client "${client.name}" (website: ${client.gscSiteUrl}).

IMPORTANT: The current month is ${currentMonthLabel}. Any work under a "${now.toLocaleString("en-US", { month: "long" })}" heading is currentMonth.

For other months, categorize STRICTLY by chronological position — each month must appear in EXACTLY ONE category:
- pastMonth: Any month that is chronologically BEFORE ${currentMonthLabel}. This includes all months from previous years and earlier months in ${now.getFullYear()}.
- upcomingMonth: Any month that is chronologically AFTER ${currentMonthLabel}, regardless of whether tasks are checked or unchecked. Future months are NEVER pastMonths.
When month headings lack a year, infer the year from context: if the notes have a year heading (e.g., "### 2025"), use that year. Otherwise, completed months with names after ${now.toLocaleString("en-US", { month: "long" })} are from the previous year (e.g., if current month is March 2026, a completed "April" section is April 2025, not April 2026). Always include the year in monthLabel (e.g., "March 2025", not just "March").${skipInstruction}

Process these notes and return structured JSON:

---
${rawMarkdown}
---`;

  const langfuse = getLangfuse();
  const generation = langfuse.generation({
    traceId: parentTraceId,
    name: skipPastMonths ? "claude-enrichment-current" : "claude-enrichment-full",
    model: "claude-sonnet-4-20250514",
    modelParameters: { max_tokens: maxTokens },
    input: { system: SYSTEM_PROMPT, user: userPrompt },
    metadata: {
      client: client.slug,
      skipPastMonths,
      inputChars: rawMarkdown.length,
    },
  });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
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
    metadata: {
      stopReason: response.stop_reason,
      cacheCreationInputTokens: (response.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: (response.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0,
    },
  });

  // Parse JSON — handle potential markdown wrapping
  let jsonStr = text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  return JSON.parse(jsonStr) as ClaudeStructuredOutput;
}

/**
 * Simplified system prompt for extracting only historical month data
 */
const HISTORY_SYSTEM_PROMPT = `You extract structured month data from SEO agency client notes. For each month section provided, extract tasks, subtasks, links, categories, and a summary.

CRITICAL RULES:
- PRESERVE EVERY CHECKBOX as its own task. Do NOT merge checkboxes.
- Subtasks are nested bullets under a checkbox — include as objects with "text", "completed", "link", "linkLabel".
- Include ALL URLs/links found in subtasks in "deliverableLinks".
- Use EXACT task text from notes (light grammar cleanup only).
- Set "completed" based on checkbox state: [x] = true, [ ] = false.
- Categorize tasks: Content, On-Page SEO, Technical, Link Building, Analytics, or Strategy.
- Add "impact" — one sentence on why the task matters.
- Extract "notableWins" from any "Account Wins", "Account Review", or metric claims in the month section.
- Extract metric claims (e.g. "Clicks increased by 42%") into notableWins.

Return ONLY a JSON array of month objects:
[
  {
    "monthLabel": "February 2026",
    "summary": "2-3 sentence summary",
    "tasks": [{ "task": "...", "completed": true, "category": ["..."], "subtasks": [], "deliverableLinks": [], "impact": "..." }],
    "leads": null,
    "metrics": { "sessions": null, "impressions": null, "notableWins": ["achievement from notes"] }
  }
]

Rules:
- NEVER fabricate content. Only extract what is in the notes.
- Return ONLY the JSON array, no markdown wrapping, no explanation.`;

/**
 * Process historical month sections in batches through Claude.
 * Returns all EnrichedMonth objects concatenated from all batches.
 */
async function callClaudeForHistory(
  monthSections: Array<{ monthLabel: string; content: string }>,
  client: ClientConfig,
  parentTraceId?: string
): Promise<EnrichedMonth[]> {
  const allMonths: EnrichedMonth[] = [];
  const langfuse = getLangfuse();

  // Process in batches
  for (let i = 0; i < monthSections.length; i += HISTORY_BATCH_SIZE) {
    const batch = monthSections.slice(i, i + HISTORY_BATCH_SIZE);
    const batchContent = batch
      .map((s) => `--- ${s.monthLabel} ---\n${s.content}`)
      .join("\n\n");
    const batchIndex = i / HISTORY_BATCH_SIZE + 1;

    const userContent = `Extract structured data for these ${batch.length} months of client "${client.name}" work notes:\n\n${batchContent}`;

    const generation = langfuse.generation({
      traceId: parentTraceId,
      name: `claude-history-batch-${batchIndex}`,
      model: "claude-sonnet-4-20250514",
      modelParameters: { max_tokens: 8192 },
      input: { system: HISTORY_SYSTEM_PROMPT, user: userContent },
      metadata: {
        client: client.slug,
        batchIndex,
        monthsInBatch: batch.map((s) => s.monthLabel),
        inputChars: batchContent.length,
      },
    });

    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: HISTORY_SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: userContent,
        }],
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
        metadata: {
          stopReason: response.stop_reason,
          cacheCreationInputTokens: (response.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0,
          cacheReadInputTokens: (response.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0,
        },
      });

      let jsonStr = text.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }

      const parsed = JSON.parse(jsonStr) as EnrichedMonth[];
      allMonths.push(...parsed);
    } catch (error) {
      generation.end({
        output: String(error),
        level: "ERROR",
        statusMessage: `History batch ${batchIndex} failed`,
      });
      console.error(`History batch ${batchIndex} failed for ${client.slug}:`, error);
      // Continue with remaining batches — partial history is better than none
    }
  }

  return allMonths;
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

  // Create Langfuse trace for the entire enrichment pipeline
  const langfuse = getLangfuse();
  const trace = langfuse.trace({
    name: "client-enrichment",
    metadata: {
      client: client.slug,
      clientName: client.name,
      mode,
      inputChars: rawMarkdown.length,
    },
    tags: [mode, client.slug],
  });

  // Step 1: Detect page size and determine enrichment strategy
  const { months: allMonthSections } = splitAllMonthSections(rawMarkdown);
  const now = new Date();
  const currentMonthName = now.toLocaleString("en-US", { month: "long" });

  // Separate current/upcoming months from historical months
  const currentYear = String(now.getFullYear());
  const historicalSections = allMonthSections.filter((s) => {
    const label = s.monthLabel.toLowerCase();
    // Only exclude the CURRENT month+year (e.g., "March 2026"), not same-named months from other years
    const isCurrentMonth = label.startsWith(currentMonthName.toLowerCase());
    const hasCurrentYear = s.monthLabel.includes(currentYear);
    const hasNoYear = !s.monthLabel.match(/\d{4}/);
    return !(isCurrentMonth && (hasCurrentYear || hasNoYear));
  });

  const useMultiPass = mode === "full" && historicalSections.length > MULTIPASS_MONTH_THRESHOLD;

  trace.update({
    metadata: {
      client: client.slug,
      clientName: client.name,
      mode,
      inputChars: rawMarkdown.length,
      strategy: useMultiPass ? "multi-pass" : "single-pass",
      totalMonths: allMonthSections.length,
      historicalMonths: historicalSections.length,
    },
  });

  let structured: ClaudeStructuredOutput;

  if (useMultiPass) {
    // Multi-pass: large page with many historical months
    console.log(`[enrichment] Multi-pass mode for ${client.slug}: ${historicalSections.length} historical months`);

    // Pass 1: Current month, goals, upcoming, entities, approvals (skip pastMonths to save output tokens)
    structured = await callClaude(rawMarkdown, client, { maxTokens: 8192, skipPastMonths: true }, trace.id);

    // Pass 2+: Historical months in batches
    const historyMonths = await callClaudeForHistory(historicalSections, client, trace.id);

    // Sort most recent first (parse year and month from label)
    const MONTH_ORDER = ["january","february","march","april","may","june","july","august","september","october","november","december"];
    historyMonths.sort((a, b) => {
      const parseLabel = (label: string) => {
        const parts = label.toLowerCase().match(/(\w+)\s*(\d{4})?/);
        if (!parts) return 0;
        const mi = MONTH_ORDER.indexOf(parts[1]);
        const yr = parts[2] ? parseInt(parts[2]) : now.getFullYear();
        return yr * 12 + mi;
      };
      return parseLabel(b.monthLabel) - parseLabel(a.monthLabel);
    });

    structured.pastMonths = historyMonths;
  } else {
    // Single pass: small/medium page — 16384 tokens handles up to ~10 months comfortably
    structured = await callClaude(rawMarkdown, client, undefined, trace.id);
  }

  // Safeguard: remove any months from pastMonths that are chronologically after the current month
  if (structured.pastMonths?.length) {
    const MONTH_NAMES = ["january","february","march","april","may","june","july","august","september","october","november","december"];
    const currentVal = now.getFullYear() * 12 + now.getMonth();
    structured.pastMonths = structured.pastMonths.filter((pm: { monthLabel?: string; label?: string }) => {
      const label = (pm.monthLabel || pm.label || "").toLowerCase();
      const parts = label.match(/(\w+)\s*(\d{4})?/);
      if (!parts) return true;
      const mi = MONTH_NAMES.indexOf(parts[1]);
      if (mi === -1) return true;
      const yr = parts[2] ? parseInt(parts[2]) : now.getFullYear();
      const monthVal = yr * 12 + mi;
      return monthVal < currentVal;
    });
  }

  // Safeguard: remove any months from upcomingMonths that are chronologically before or equal to current month
  if (structured.upcomingMonths?.length) {
    const MONTH_NAMES = ["january","february","march","april","may","june","july","august","september","october","november","december"];
    const currentVal = now.getFullYear() * 12 + now.getMonth();
    structured.upcomingMonths = structured.upcomingMonths.filter((um: { monthLabel?: string; label?: string }) => {
      const label = (um.monthLabel || um.label || "").toLowerCase();
      const parts = label.match(/(\w+)\s*(\d{4})?/);
      if (!parts) return true;
      const mi = MONTH_NAMES.indexOf(parts[1]);
      if (mi === -1) return true;
      const yr = parts[2] ? parseInt(parts[2]) : now.getFullYear();
      const monthVal = yr * 12 + mi;
      return monthVal > currentVal;
    });
  }

  // Step 2: Fetch analytics for detected entities
  const analyticsEnrichments = await fetchAnalyticsForEntities(structured, client);

  // Step 3: Upsert any approval requests to DB
  if (structured.approvals?.length) {
    for (const approval of structured.approvals) {
      await upsertApproval(client.slug, approval.title, approval.description, approval.links);
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

  const result = {
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

  // Finalize trace
  trace.update({
    output: {
      tasksExtracted: result.currentMonth?.tasks?.length ?? 0,
      pastMonths: result.pastMonths?.length ?? 0,
      goalsExtracted: result.goals?.length ?? 0,
      approvalsExtracted: result.approvals?.length ?? 0,
    },
  });

  // Flush to ensure all events are sent to Langfuse
  await flushLangfuse();

  return result;
}
