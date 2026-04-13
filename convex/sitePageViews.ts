import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const create = mutation({
  args: {
    siteId: v.id("trackedSites"),
    visitorId: v.id("siteVisitors"),
    url: v.string(),
    path: v.string(),
    title: v.optional(v.string()),
    referrer: v.optional(v.string()),
    utmSource: v.optional(v.string()),
    utmMedium: v.optional(v.string()),
    utmCampaign: v.optional(v.string()),
    sessionId: v.string(),
    durationSeconds: v.optional(v.number()),
    timestamp: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sitePageViews", args);
  },
});

export const updateDuration = mutation({
  args: {
    id: v.id("sitePageViews"),
    durationSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { durationSeconds: args.durationSeconds });
  },
});

export const listByVisitor = query({
  args: { visitorId: v.id("siteVisitors"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sitePageViews")
      .withIndex("by_visitor", (q) => q.eq("visitorId", args.visitorId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const listBySite = query({
  args: { siteId: v.id("trackedSites"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sitePageViews")
      .withIndex("by_site_timestamp", (q) => q.eq("siteId", args.siteId))
      .order("desc")
      .take(args.limit ?? 200);
  },
});

export const listBySession = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sitePageViews")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();
  },
});
