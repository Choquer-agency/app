import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.activeOnly) {
      return await ctx.db
        .query("convergeProfiles")
        .withIndex("by_active", (q) => q.eq("active", true))
        .collect();
    }
    return await ctx.db.query("convergeProfiles").collect();
  },
});

export const listByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("convergeProfiles")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
  },
});

export const getById = query({
  args: { id: v.id("convergeProfiles") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    clientId: v.id("clients"),
    recurringId: v.string(),
    label: v.optional(v.string()),
    currency: v.string(), // "USD" | "CAD"
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("convergeProfiles", {
      clientId: args.clientId,
      recurringId: args.recurringId,
      label: args.label,
      currency: args.currency,
      active: true,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("convergeProfiles"),
    lastPolledAt: v.optional(v.string()),
    lastStatus: v.optional(v.string()),
    cardLastFour: v.optional(v.string()),
    cardExpiryMonth: v.optional(v.number()),
    cardExpiryYear: v.optional(v.number()),
    cardExpiryNotifiedAt: v.optional(v.string()),
    amount: v.optional(v.number()),
    billingCycle: v.optional(v.string()),
    nextPaymentDate: v.optional(v.string()),
    paymentsMade: v.optional(v.number()),
    active: v.optional(v.boolean()),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    // Remove undefined fields so we only patch what's provided
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }
    await ctx.db.patch(id, patch);
    return id;
  },
});

export const deactivate = mutation({
  args: { id: v.id("convergeProfiles") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { active: false });
  },
});
