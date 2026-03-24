import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const getForClient = query({
  args: { clientSlug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("monthlySnapshots")
      .withIndex("by_client_month", (q) => q.eq("clientSlug", args.clientSlug))
      .order("desc")
      .take(24);
  },
});

export const getForMonth = query({
  args: { clientSlug: v.string(), month: v.string() },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("monthlySnapshots")
      .withIndex("by_client_month", (q) =>
        q.eq("clientSlug", args.clientSlug).eq("month", args.month)
      )
      .take(1);
    return docs[0] ?? null;
  },
});

export const upsert = mutation({
  args: {
    clientSlug: v.string(),
    month: v.string(),
    gscData: v.optional(v.any()),
    ga4Data: v.optional(v.any()),
    keywordData: v.optional(v.any()),
    kpiSummary: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("monthlySnapshots")
      .withIndex("by_client_month", (q) =>
        q.eq("clientSlug", args.clientSlug).eq("month", args.month)
      )
      .take(1);

    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, {
        gscData: args.gscData,
        ga4Data: args.ga4Data,
        keywordData: args.keywordData,
        kpiSummary: args.kpiSummary,
      });
      return existing[0]._id;
    }

    return await ctx.db.insert("monthlySnapshots", {
      clientSlug: args.clientSlug,
      month: args.month,
      gscData: args.gscData,
      ga4Data: args.ga4Data,
      keywordData: args.keywordData,
      kpiSummary: args.kpiSummary,
    });
  },
});
