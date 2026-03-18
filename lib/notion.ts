import { Client } from "@notionhq/client";
import { cachedFetch } from "./cache";
import { QuarterlyGoal, WorkLogEntry } from "@/types";
import { getClientBySlug } from "./clients";

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

const GOALS_DB = process.env.NOTION_GOALS_DB!;
const WORKLOG_DB = process.env.NOTION_WORKLOG_DB!;

const CACHE_TTL = 3600; // 1 hour

// Helper to extract plain text from Notion rich text
function richTextToString(richText: Array<{ plain_text: string }>): string {
  return richText.map((t) => t.plain_text).join("");
}

// Helper to extract a property value from a Notion page
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getProp(page: any, name: string): any {
  return page.properties?.[name];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTextProp(page: any, name: string): string {
  const prop = getProp(page, name);
  if (!prop) return "";
  if (prop.type === "title") return richTextToString(prop.title);
  if (prop.type === "rich_text") return richTextToString(prop.rich_text);
  if (prop.type === "url") return prop.url || "";
  if (prop.type === "email") return prop.email || "";
  if (prop.type === "phone_number") return prop.phone_number || "";
  return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNumberProp(page: any, name: string): number {
  const prop = getProp(page, name);
  return prop?.number ?? 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMultiSelectProp(page: any, name: string): string[] {
  const prop = getProp(page, name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prop?.multi_select?.map((s: any) => s.name) || [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDateProp(page: any, name: string): string {
  const prop = getProp(page, name);
  return prop?.date?.start || "";
}

/**
 * Get quarterly goals for a client
 */
export async function getQuarterlyGoals(clientSlug: string): Promise<QuarterlyGoal[]> {
  const now = new Date();
  const quarter = `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`;

  return cachedFetch(`notion:goals:${clientSlug}:${quarter}`, CACHE_TTL, async () => {
    const clientConfig = await getClientBySlug(clientSlug);
    if (!clientConfig) return [];

    const response = await notion.databases.query({
      database_id: GOALS_DB,
      filter: {
        and: [
          { property: "Quarter", select: { equals: quarter } },
        ],
      },
    });

    // Filter by client relation (check the relation page's slug)
    const goals: QuarterlyGoal[] = [];
    for (const page of response.results) {
      const relationProp = getProp(page, "Client");
      if (relationProp?.relation?.length) {
        const relatedIds = relationProp.relation.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (r: any) => r.id
        );
        if (relatedIds.length > 0) {
          goals.push({
            id: page.id,
            goal: getTextProp(page, "Goal"),
            icon: getTextProp(page, "Icon") || "\uD83C\uDFAF",
            targetMetric: getTextProp(page, "Target Metric"),
            progress: getNumberProp(page, "Progress"),
            quarter,
          });
        }
      }
    }

    return goals;
  });
}

/**
 * Get work log entries for a client in a specific month
 */
export async function getWorkLog(
  clientSlug: string,
  month: string // ISO date string, e.g. "2026-03-01"
): Promise<WorkLogEntry[]> {
  return cachedFetch(`notion:worklog:${clientSlug}:${month}`, CACHE_TTL, async () => {
    const response = await notion.databases.query({
      database_id: WORKLOG_DB,
      filter: {
        and: [
          { property: "Month", date: { equals: month } },
          { property: "Is Plan (Next Month)", checkbox: { equals: false } },
        ],
      },
    });

    return response.results.map((page) => ({
      id: page.id,
      task: getTextProp(page, "Task"),
      category: getMultiSelectProp(page, "Category"),
      subtasks: getTextProp(page, "Subtasks"),
      deliverableLinks: getTextProp(page, "Deliverable Links")
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean),
      monthlySummary: getTextProp(page, "Monthly Summary"),
      month,
      isPlan: false,
    }));
  });
}

/**
 * Get next month's planned work
 */
export async function getMonthlyPlan(
  clientSlug: string,
  month: string
): Promise<WorkLogEntry[]> {
  return cachedFetch(`notion:plan:${clientSlug}:${month}`, CACHE_TTL, async () => {
    const response = await notion.databases.query({
      database_id: WORKLOG_DB,
      filter: {
        and: [
          { property: "Month", date: { equals: month } },
          { property: "Is Plan (Next Month)", checkbox: { equals: true } },
        ],
      },
    });

    return response.results.map((page) => ({
      id: page.id,
      task: getTextProp(page, "Task"),
      category: getMultiSelectProp(page, "Category"),
      subtasks: getTextProp(page, "Subtasks"),
      deliverableLinks: [],
      monthlySummary: "",
      month,
      isPlan: true,
    }));
  });
}

/**
 * Get all historical work log months for a client
 */
export async function getWorkLogHistory(
  clientSlug: string
): Promise<{ months: string[]; entriesByMonth: Record<string, WorkLogEntry[]>; summariesByMonth: Record<string, string> }> {
  return cachedFetch(`notion:history:${clientSlug}`, CACHE_TTL, async () => {
    const response = await notion.databases.query({
      database_id: WORKLOG_DB,
      filter: {
        property: "Is Plan (Next Month)",
        checkbox: { equals: false },
      },
      sorts: [{ property: "Month", direction: "descending" }],
    });

    const entriesByMonth: Record<string, WorkLogEntry[]> = {};
    const summariesByMonth: Record<string, string> = {};

    for (const page of response.results) {
      const month = getDateProp(page, "Month");
      if (!month) continue;

      const entry: WorkLogEntry = {
        id: page.id,
        task: getTextProp(page, "Task"),
        category: getMultiSelectProp(page, "Category"),
        subtasks: getTextProp(page, "Subtasks"),
        deliverableLinks: getTextProp(page, "Deliverable Links")
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean),
        monthlySummary: getTextProp(page, "Monthly Summary"),
        month,
        isPlan: false,
      };

      if (!entriesByMonth[month]) entriesByMonth[month] = [];
      entriesByMonth[month].push(entry);

      if (entry.monthlySummary && !summariesByMonth[month]) {
        summariesByMonth[month] = entry.monthlySummary;
      }
    }

    // Exclude current month from historical
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const months = Object.keys(entriesByMonth)
      .filter((m) => m < currentMonth)
      .sort()
      .reverse();

    return { months, entriesByMonth, summariesByMonth };
  });
}
