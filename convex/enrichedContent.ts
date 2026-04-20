import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Atomic read-modify-write of the client's single dashboard snapshot.
// Concurrent calls serialize via Convex OCC, so parallel month enrichments
// can never clobber each other's pastMonths array.
export const mergeMonth = mutation({
  args: {
    clientSlug: v.string(),
    canonicalMonth: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("complete"),
      v.literal("forecast")
    ),
    monthLabel: v.string(),
    monthDoc: v.any(),
    currentMonthPayload: v.optional(v.any()),
    goalsOverride: v.optional(v.any()),
    approvalsOverride: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const latestDocs = await ctx.db
      .query("enrichedContent")
      .withIndex("by_client_month", (q) => q.eq("clientSlug", args.clientSlug))
      .order("desc")
      .take(1);
    const latest = latestDocs[0] ?? null;
    const existingData =
      (latest?.enrichedData as Record<string, unknown> | undefined) ?? {};

    let newData: Record<string, unknown>;
    if (args.status === "active") {
      newData = {
        ...existingData,
        currentMonth: args.currentMonthPayload ?? existingData.currentMonth,
        goals:
          Array.isArray(args.goalsOverride) && args.goalsOverride.length
            ? args.goalsOverride
            : existingData.goals ?? [],
        approvals: args.approvalsOverride ?? existingData.approvals,
        processedAt: new Date().toISOString(),
      };
    } else {
      const pastMonths = (
        (existingData.pastMonths as Array<{ monthLabel?: string }> | undefined) ||
        []
      ).filter((m) => m?.monthLabel !== args.monthLabel);
      pastMonths.unshift(args.monthDoc);
      newData = {
        ...existingData,
        pastMonths,
        processedAt: new Date().toISOString(),
      };
    }

    const canonicalMonth = latest?.month ?? args.canonicalMonth;

    const existing = await ctx.db
      .query("enrichedContent")
      .withIndex("by_client_month", (q) =>
        q.eq("clientSlug", args.clientSlug).eq("month", canonicalMonth)
      )
      .take(1);

    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, {
        enrichedData: newData,
      });
      return existing[0]._id;
    }

    return await ctx.db.insert("enrichedContent", {
      clientSlug: args.clientSlug,
      month: canonicalMonth,
      rawContent: latest?.rawContent ?? "",
      enrichedData: newData,
    });
  },
});

// Delete every enrichedContent row for a client — used when wiping all
// SEO strategy data so the dashboard starts completely empty.
export const deleteAllForClient = mutation({
  args: { clientSlug: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("enrichedContent")
      .withIndex("by_client_month", (q) => q.eq("clientSlug", args.clientSlug))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return rows.length;
  },
});

// Reset pastMonths + currentMonth on the client's snapshot before a full
// rebuild. Preserves goals/approvals/other top-level fields.
export const resetForRebuild = mutation({
  args: { clientSlug: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("enrichedContent")
      .withIndex("by_client_month", (q) => q.eq("clientSlug", args.clientSlug))
      .collect();
    for (const row of rows) {
      const existingData =
        (row.enrichedData as Record<string, unknown> | undefined) ?? {};
      await ctx.db.patch(row._id, {
        enrichedData: {
          ...existingData,
          pastMonths: [],
          currentMonth: undefined,
          processedAt: new Date().toISOString(),
        },
      });
    }
    return rows.length;
  },
});

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
