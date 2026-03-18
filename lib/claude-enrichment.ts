import Anthropic from "@anthropic-ai/sdk";
import { ClientConfig } from "@/types";
import {
  ClaudeStructuredOutput,
  EnrichedContent,
  AnalyticsEnrichment,
} from "@/types/enrichment";
import { getGSCPerformance, getGSCTimeSeries, getDateRange } from "./gsc";
import { getGA4Sessions } from "./ga4";
import crypto from "crypto";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a content processor for an SEO agency's client dashboard. You receive raw team notes from a Notion page and must extract, structure, and lightly polish the content.

Your job:
1. STRUCTURE the content into current month work, goals, and upcoming months
2. LIGHTLY POLISH grammar and tone — keep the original voice but make it professional enough for a client to read. Don't over-formalize.
3. DETECT ENTITIES — identify any specific page URLs (like /blog, /services), keywords (like "corporate housing LA"), and metric claims (like "10% traffic increase")
4. For tasks, categorize them into: Content, On-Page SEO, Technical, Link Building, Analytics, or Strategy

Return ONLY valid JSON matching this exact structure:
{
  "currentMonth": {
    "label": "March 2026",
    "summary": "2-3 sentence summary of what was accomplished or is in progress this month",
    "strategy": "1-2 sentence description of the strategic focus this month",
    "tasks": [
      {
        "task": "polished task description",
        "category": ["Content"],
        "subtasks": "details if available",
        "deliverableLinks": ["https://..."]
      }
    ],
    "isComplete": false
  },
  "goals": [
    {
      "goal": "goal description",
      "icon": "📈",
      "targetMetric": "specific target",
      "progress": 45,
      "deadline": "End of Q1 2026"
    }
  ],
  "upcomingMonths": [
    {
      "monthLabel": "April 2026",
      "summary": "brief strategy for this month",
      "tasks": [{ "task": "...", "category": ["..."], "subtasks": "", "deliverableLinks": [] }]
    }
  ],
  "detectedEntities": {
    "pages": ["/blog", "/services"],
    "keywords": ["corporate housing LA"],
    "metrics": [
      {
        "claim": "10% traffic increase on /blog",
        "metricType": "traffic",
        "pageUrl": "/blog",
        "value": "10%",
        "direction": "increase"
      }
    ]
  }
}

Rules:
- If no goals are mentioned, return an empty goals array
- If no upcoming months are mentioned, return an empty upcomingMonths array
- Set isComplete to true only if the notes clearly indicate all work is done for the month
- Detect ALL page URLs mentioned (even partial paths like /blog)
- Detect ALL keywords that appear to be SEO target keywords
- Detect ALL metric claims (traffic changes, ranking changes, conversion mentions)
- Use appropriate emoji icons for goals
- Estimate progress percentage for goals based on context clues (default to 0 if unclear)
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
    max_tokens: 4096,
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
 */
export async function enrichClientContent(
  rawMarkdown: string,
  client: ClientConfig
): Promise<EnrichedContent> {
  // Step 1: Get structured output from Claude
  const structured = await callClaude(rawMarkdown, client);

  // Step 2: Fetch analytics for detected entities
  const analyticsEnrichments = await fetchAnalyticsForEntities(structured, client);

  // Step 3: Combine into final enriched content
  const contentHash = crypto
    .createHash("md5")
    .update(rawMarkdown)
    .digest("hex");

  return {
    ...structured,
    analyticsEnrichments,
    processedAt: new Date().toISOString(),
    rawContentHash: contentHash,
  };
}
