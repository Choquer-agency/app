import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listByJob = query({
  args: { syncJobId: v.id("syncJobs"), limit: v.optional(v.number()) },
  handler: async (ctx, { syncJobId, limit }) => {
    return await ctx.db
      .query("syncRuns")
      .withIndex("by_job", (q) => q.eq("syncJobId", syncJobId))
      .order("desc")
      .take(limit ?? 50);
  },
});

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("syncRuns")
      .order("desc")
      .take(limit ?? 100);
  },
});

export const start = mutation({
  args: {
    syncJobId: v.id("syncJobs"),
    triggeredBy: v.string(),
    triggeredById: v.optional(v.id("teamMembers")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("syncRuns", {
      syncJobId: args.syncJobId,
      startedAt: Date.now(),
      status: "running",
      triggeredBy: args.triggeredBy,
      triggeredById: args.triggeredById,
    });
  },
});

export const complete = mutation({
  args: {
    id: v.id("syncRuns"),
    status: v.string(),
    rowsWritten: v.optional(v.number()),
    rowsRead: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const run = await ctx.db.get(args.id);
    const duration = run ? now - run.startedAt : undefined;
    await ctx.db.patch(args.id, {
      finishedAt: now,
      durationMs: duration,
      status: args.status,
      rowsWritten: args.rowsWritten,
      rowsRead: args.rowsRead,
      error: args.error,
    });
  },
});
