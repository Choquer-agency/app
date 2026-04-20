import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const STATUS_VALIDATOR = v.union(
  v.literal("forecast"),
  v.literal("active"),
  v.literal("complete")
);

const ENRICHMENT_STATE_VALIDATOR = v.union(
  v.literal("idle"),
  v.literal("queued"),
  v.literal("running"),
  v.literal("error")
);

export const listByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("seoStrategyMonths")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
  },
});

export const listBySlug = query({
  args: { clientSlug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("seoStrategyMonths")
      .withIndex("by_slug_monthKey", (q) => q.eq("clientSlug", args.clientSlug))
      .collect();
  },
});

export const getEnrichmentProgress = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("seoStrategyMonths")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    const counts = { idle: 0, queued: 0, running: 0, error: 0 };
    for (const r of rows) {
      counts[r.enrichmentState as keyof typeof counts] =
        (counts[r.enrichmentState as keyof typeof counts] ?? 0) + 1;
    }
    return { total: rows.length, ...counts };
  },
});

export const listAllImportSummaries = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("seoStrategyMonths").collect();
    const byClient = new Map<
      string,
      {
        clientId: string;
        total: number;
        idle: number;
        queued: number;
        running: number;
        error: number;
        lastEditedAt: number;
      }
    >();
    for (const r of all) {
      const key = r.clientId;
      const cur = byClient.get(key) ?? {
        clientId: key,
        total: 0,
        idle: 0,
        queued: 0,
        running: 0,
        error: 0,
        lastEditedAt: 0,
      };
      cur.total += 1;
      cur[r.enrichmentState as "idle" | "queued" | "running" | "error"] += 1;
      if (r.lastEditedAt > cur.lastEditedAt) cur.lastEditedAt = r.lastEditedAt;
      byClient.set(key, cur);
    }
    const summaries = await Promise.all(
      [...byClient.values()].map(async (s) => {
        const client = await ctx.db.get(s.clientId as Id<"clients">);
        return {
          ...s,
          clientName: (client as any)?.name ?? "Unknown",
        };
      })
    );
    return summaries.sort((a, b) => b.lastEditedAt - a.lastEditedAt);
  },
});

export const getByMonthKey = query({
  args: { clientId: v.id("clients"), monthKey: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("seoStrategyMonths")
      .withIndex("by_client_monthKey", (q) =>
        q.eq("clientId", args.clientId).eq("monthKey", args.monthKey)
      )
      .unique();
  },
});

export const getBySlugAndMonthKey = query({
  args: { clientSlug: v.string(), monthKey: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("seoStrategyMonths")
      .withIndex("by_slug_monthKey", (q) =>
        q.eq("clientSlug", args.clientSlug).eq("monthKey", args.monthKey)
      )
      .unique();
  },
});

export const getById = query({
  args: { id: v.id("seoStrategyMonths") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const upsert = mutation({
  args: {
    clientId: v.id("clients"),
    clientSlug: v.string(),
    year: v.number(),
    month: v.number(),
    monthKey: v.string(),
    status: STATUS_VALIDATOR,
    rawContent: v.string(),
    rawContentHash: v.string(),
    lastEditedBy: v.optional(v.id("teamMembers")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("seoStrategyMonths")
      .withIndex("by_client_monthKey", (q) =>
        q.eq("clientId", args.clientId).eq("monthKey", args.monthKey)
      )
      .unique();

    const now = Date.now();

    if (existing) {
      const hashChanged = existing.rawContentHash !== args.rawContentHash;
      const patch: Record<string, unknown> = {
        rawContent: args.rawContent,
        rawContentHash: args.rawContentHash,
        lastEditedAt: now,
        lastEditedBy: args.lastEditedBy,
        status: args.status,
      };
      if (hashChanged && existing.enrichmentState === "idle") {
        patch.enrichmentState = "queued";
        patch.enrichmentQueuedAt = now;
        patch.enrichmentError = undefined;
      }
      await ctx.db.patch(existing._id, patch);
      const updated = await ctx.db.get(existing._id);
      return updated!;
    }

    const id = await ctx.db.insert("seoStrategyMonths", {
      clientId: args.clientId,
      clientSlug: args.clientSlug,
      year: args.year,
      month: args.month,
      monthKey: args.monthKey,
      status: args.status,
      rawContent: args.rawContent,
      rawContentHash: args.rawContentHash,
      lastEditedAt: now,
      lastEditedBy: args.lastEditedBy,
      enrichmentState: "queued",
      enrichmentQueuedAt: now,
    });
    const inserted = await ctx.db.get(id);
    return inserted!;
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("seoStrategyMonths"),
    status: STATUS_VALIDATOR,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status });
  },
});

export const setQuarterlyGoal = mutation({
  args: {
    id: v.id("seoStrategyMonths"),
    quarterlyGoal: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { quarterlyGoal: args.quarterlyGoal });
  },
});

export const setClientApproval = mutation({
  args: {
    id: v.id("seoStrategyMonths"),
    approved: v.boolean(),
    teamMemberId: v.optional(v.id("teamMembers")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      clientApprovedAt: args.approved ? Date.now() : undefined,
      clientApprovedBy: args.approved ? args.teamMemberId : undefined,
    });
  },
});

export const claimNextEnrichmentBatch = mutation({
  args: {
    olderThanMs: v.number(), // only pick rows queued before this timestamp
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const queued = await ctx.db
      .query("seoStrategyMonths")
      .withIndex("by_enrichment_queue", (q) => q.eq("enrichmentState", "queued"))
      .order("asc")
      .take(args.limit * 4); // overscan; we filter by queuedAt below

    const now = Date.now();
    const claimed = [];
    for (const row of queued) {
      if (claimed.length >= args.limit) break;
      const queuedAt = row.enrichmentQueuedAt ?? 0;
      if (queuedAt > args.olderThanMs) continue;
      await ctx.db.patch(row._id, {
        enrichmentState: "running",
        enrichmentStartedAt: now,
      });
      claimed.push(row);
    }
    return claimed;
  },
});

export const recordEnrichmentResult = mutation({
  args: {
    id: v.id("seoStrategyMonths"),
    success: v.boolean(),
    error: v.optional(v.string()),
    enrichedHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.id, {
      enrichmentState: args.success ? "idle" : "error",
      enrichmentCompletedAt: now,
      enrichmentError: args.error,
      lastEnrichedHash: args.enrichedHash,
    });
  },
});

export const requeue = mutation({
  args: { id: v.id("seoStrategyMonths") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      enrichmentState: "queued",
      enrichmentQueuedAt: Date.now(),
      enrichmentError: undefined,
    });
  },
});

export const requeueAllForClient = mutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("seoStrategyMonths")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    const now = Date.now();
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        enrichmentState: "queued",
        enrichmentQueuedAt: now,
        enrichmentError: undefined,
      });
    }
    return rows.length;
  },
});

export const deleteAllForClient = mutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("seoStrategyMonths")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return rows.length;
  },
});

export const insertSeed = mutation({
  args: {
    clientId: v.id("clients"),
    clientSlug: v.string(),
    year: v.number(),
    month: v.number(),
    monthKey: v.string(),
    status: STATUS_VALIDATOR,
    rawContent: v.string(),
    rawContentHash: v.string(),
    enrichmentState: ENRICHMENT_STATE_VALIDATOR,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("seoStrategyMonths")
      .withIndex("by_client_monthKey", (q) =>
        q.eq("clientId", args.clientId).eq("monthKey", args.monthKey)
      )
      .unique();
    if (existing) return existing._id;

    const now = Date.now();
    return await ctx.db.insert("seoStrategyMonths", {
      clientId: args.clientId,
      clientSlug: args.clientSlug,
      year: args.year,
      month: args.month,
      monthKey: args.monthKey,
      status: args.status,
      rawContent: args.rawContent,
      rawContentHash: args.rawContentHash,
      lastEditedAt: now,
      enrichmentState: args.enrichmentState,
      enrichmentQueuedAt: args.enrichmentState === "queued" ? now : undefined,
    });
  },
});
