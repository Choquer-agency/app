import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("paymentIssues")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    }
    return await ctx.db.query("paymentIssues").collect();
  },
});

export const listUnresolved = query({
  args: {},
  handler: async (ctx) => {
    const open = await ctx.db
      .query("paymentIssues")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    const escalated = await ctx.db
      .query("paymentIssues")
      .withIndex("by_status", (q) => q.eq("status", "escalated"))
      .collect();
    return [...open, ...escalated];
  },
});

export const getById = query({
  args: { id: v.id("paymentIssues") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByConvergeProfile = query({
  args: { convergeProfileId: v.id("convergeProfiles") },
  handler: async (ctx, args) => {
    const issues = await ctx.db
      .query("paymentIssues")
      .withIndex("by_convergeProfile", (q) =>
        q.eq("convergeProfileId", args.convergeProfileId)
      )
      .collect();
    // Return the latest open or escalated issue
    return issues.find((i) => i.status === "open" || i.status === "escalated") || null;
  },
});

export const getOpenByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const issues = await ctx.db
      .query("paymentIssues")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    return issues.filter((i) => i.status === "open" || i.status === "escalated");
  },
});

export const create = mutation({
  args: {
    clientId: v.id("clients"),
    convergeProfileId: v.optional(v.id("convergeProfiles")),
    convergeStatus: v.optional(v.string()),
    failureCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return await ctx.db.insert("paymentIssues", {
      clientId: args.clientId,
      convergeProfileId: args.convergeProfileId,
      status: "open",
      failureCount: args.failureCount ?? 1,
      convergeStatus: args.convergeStatus,
      firstFailedAt: now,
      lastFailedAt: now,
      emailCount: 0,
    });
  },
});

export const escalate = mutation({
  args: {
    id: v.id("paymentIssues"),
    ticketId: v.optional(v.id("tickets")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "escalated",
      escalatedAt: new Date().toISOString(),
      ticketId: args.ticketId,
    });
  },
});

export const resolve = mutation({
  args: {
    id: v.id("paymentIssues"),
    resolvedBy: v.optional(v.id("teamMembers")),
    resolutionNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "resolved",
      resolvedAt: new Date().toISOString(),
      resolvedBy: args.resolvedBy,
      resolutionNote: args.resolutionNote,
    });
  },
});

export const updateFailure = mutation({
  args: {
    id: v.id("paymentIssues"),
    failureCount: v.optional(v.number()),
    convergeStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {
      lastFailedAt: new Date().toISOString(),
    };
    if (args.failureCount !== undefined) patch.failureCount = args.failureCount;
    if (args.convergeStatus !== undefined) patch.convergeStatus = args.convergeStatus;
    await ctx.db.patch(args.id, patch);
  },
});

export const updateEmailTracking = mutation({
  args: {
    id: v.id("paymentIssues"),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.id);
    if (!issue) return;
    await ctx.db.patch(args.id, {
      lastClientEmailAt: new Date().toISOString(),
      emailCount: (issue.emailCount ?? 0) + 1,
    });
  },
});
