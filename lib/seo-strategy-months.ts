import crypto from "crypto";
import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export type MonthStatus = "forecast" | "active" | "complete";
export type EnrichmentState = "idle" | "queued" | "running" | "error";

export interface SeoStrategyMonth {
  id: string;
  clientId: string;
  clientSlug: string;
  year: number;
  month: number;
  monthKey: string;
  status: MonthStatus;
  rawContent: string;
  rawContentHash: string;
  lastEditedAt: number;
  lastEditedBy?: string;
  enrichmentState: EnrichmentState;
  enrichmentQueuedAt?: number;
  enrichmentStartedAt?: number;
  enrichmentCompletedAt?: number;
  enrichmentError?: string;
  lastEnrichedHash?: string;
  quarterlyGoal?: string;
  clientApprovedAt?: number;
  clientApprovedBy?: string;
}

function rowToMonth(row: any): SeoStrategyMonth {
  return {
    id: row._id,
    clientId: row.clientId,
    clientSlug: row.clientSlug,
    year: row.year,
    month: row.month,
    monthKey: row.monthKey,
    status: row.status,
    rawContent: row.rawContent,
    rawContentHash: row.rawContentHash,
    lastEditedAt: row.lastEditedAt,
    lastEditedBy: row.lastEditedBy,
    enrichmentState: row.enrichmentState,
    enrichmentQueuedAt: row.enrichmentQueuedAt,
    enrichmentStartedAt: row.enrichmentStartedAt,
    enrichmentCompletedAt: row.enrichmentCompletedAt,
    enrichmentError: row.enrichmentError,
    lastEnrichedHash: row.lastEnrichedHash,
    quarterlyGoal: row.quarterlyGoal,
    clientApprovedAt: row.clientApprovedAt,
    clientApprovedBy: row.clientApprovedBy,
  };
}

export function monthKeyOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonthKey(monthKey: string): { year: number; month: number } {
  const [y, m] = monthKey.split("-");
  return { year: Number(y), month: Number(m) };
}

export function hashContent(content: string): string {
  return crypto.createHash("md5").update(content).digest("hex");
}

export function classifyStatus(year: number, month: number, today = new Date()): MonthStatus {
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  if (year < todayYear || (year === todayYear && month < todayMonth)) return "complete";
  if (year === todayYear && month === todayMonth) return "active";
  return "forecast";
}

export async function listMonthsForClient(clientId: string): Promise<SeoStrategyMonth[]> {
  const convex = getConvexClient();
  const rows = await convex.query(api.seoStrategyMonths.listByClient, {
    clientId: clientId as Id<"clients">,
  });
  return rows.map(rowToMonth);
}

export async function listMonthsForSlug(clientSlug: string): Promise<SeoStrategyMonth[]> {
  const convex = getConvexClient();
  const rows = await convex.query(api.seoStrategyMonths.listBySlug, { clientSlug });
  return rows.map(rowToMonth);
}

export async function getMonth(
  clientId: string,
  monthKey: string
): Promise<SeoStrategyMonth | null> {
  const convex = getConvexClient();
  const row = await convex.query(api.seoStrategyMonths.getByMonthKey, {
    clientId: clientId as Id<"clients">,
    monthKey,
  });
  return row ? rowToMonth(row) : null;
}

export async function getMonthBySlug(
  clientSlug: string,
  monthKey: string
): Promise<SeoStrategyMonth | null> {
  const convex = getConvexClient();
  const row = await convex.query(api.seoStrategyMonths.getBySlugAndMonthKey, {
    clientSlug,
    monthKey,
  });
  return row ? rowToMonth(row) : null;
}

export async function saveMonth(input: {
  clientId: string;
  clientSlug: string;
  monthKey: string;
  rawContent: string;
  status?: MonthStatus;
  lastEditedBy?: string;
}): Promise<SeoStrategyMonth> {
  const convex = getConvexClient();
  const { year, month } = parseMonthKey(input.monthKey);
  const status = input.status ?? classifyStatus(year, month);
  const hash = hashContent(input.rawContent);
  const row = await convex.mutation(api.seoStrategyMonths.upsert, {
    clientId: input.clientId as Id<"clients">,
    clientSlug: input.clientSlug,
    year,
    month,
    monthKey: input.monthKey,
    status,
    rawContent: input.rawContent,
    rawContentHash: hash,
    lastEditedBy: input.lastEditedBy as Id<"teamMembers"> | undefined,
  });
  if (!row) throw new Error("Failed to save SEO strategy month");
  return rowToMonth(row);
}

export async function requeueEnrichment(id: string): Promise<void> {
  const convex = getConvexClient();
  await convex.mutation(api.seoStrategyMonths.requeue, {
    id: id as Id<"seoStrategyMonths">,
  });
}

export async function setQuarterlyGoal(id: string, goal: string): Promise<void> {
  const convex = getConvexClient();
  await convex.mutation(api.seoStrategyMonths.setQuarterlyGoal, {
    id: id as Id<"seoStrategyMonths">,
    quarterlyGoal: goal,
  });
}

export async function setClientApproval(
  id: string,
  approved: boolean,
  teamMemberId?: string
): Promise<void> {
  const convex = getConvexClient();
  await convex.mutation(api.seoStrategyMonths.setClientApproval, {
    id: id as Id<"seoStrategyMonths">,
    approved,
    teamMemberId: teamMemberId as Id<"teamMembers"> | undefined,
  });
}

export async function seedMonth(input: {
  clientId: string;
  clientSlug: string;
  monthKey: string;
  rawContent: string;
  status: MonthStatus;
  enrichmentState: EnrichmentState;
}): Promise<string> {
  const convex = getConvexClient();
  const { year, month } = parseMonthKey(input.monthKey);
  const id = await convex.mutation(api.seoStrategyMonths.insertSeed, {
    clientId: input.clientId as Id<"clients">,
    clientSlug: input.clientSlug,
    year,
    month,
    monthKey: input.monthKey,
    status: input.status,
    rawContent: input.rawContent,
    rawContentHash: hashContent(input.rawContent),
    enrichmentState: input.enrichmentState,
  });
  return id as string;
}

export const EMPTY_TIPTAP_DOC = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
