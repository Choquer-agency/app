import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const getLatest = query({
  args: { clientSlug: v.string() },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("enrichedContent")
      .withIndex("by_client_month", (q) => q.eq("clientSlug", args.clientSlug))
      .order("desc")
      .take(1);
    return docs[0] ?? null;
  },
});

export const getForMonth = query({
  args: { clientSlug: v.string(), month: v.string() },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("enrichedContent")
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
    rawContent: v.optional(v.string()),
    enrichedData: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("enrichedContent")
      .withIndex("by_client_month", (q) =>
        q.eq("clientSlug", args.clientSlug).eq("month", args.month)
      )
      .take(1);

    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, {
        rawContent: args.rawContent,
        enrichedData: args.enrichedData,
      });
      return existing[0]._id;
    }

    return await ctx.db.insert("enrichedContent", {
      clientSlug: args.clientSlug,
      month: args.month,
      rawContent: args.rawContent,
      enrichedData: args.enrichedData,
    });
  },
});
