import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (args.activeOnly) {
      return await ctx.db
        .query("packages")
        .withIndex("by_active", (q) => q.eq("active", true))
        .collect();
    }
    return await ctx.db.query("packages").collect();
  },
});

export const getById = query({
  args: { id: v.id("packages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    defaultPrice: v.number(),
    category: v.optional(v.string()),
    billingFrequency: v.optional(v.string()),
    hoursIncluded: v.optional(v.number()),
    includedServices: v.optional(v.array(v.string())),
    setupFee: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("packages", {
      name: args.name,
      description: args.description ?? "",
      defaultPrice: args.defaultPrice,
      category: args.category ?? "other",
      billingFrequency: args.billingFrequency ?? "monthly",
      hoursIncluded: args.hoursIncluded,
      includedServices: args.includedServices ?? [],
      setupFee: args.setupFee ?? 0,
      active: args.active ?? true,
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: {
    id: v.id("packages"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    defaultPrice: v.optional(v.number()),
    category: v.optional(v.string()),
    billingFrequency: v.optional(v.string()),
    hoursIncluded: v.optional(v.number()),
    includedServices: v.optional(v.array(v.string())),
    setupFee: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        updates[key] = value;
      }
    }
    await ctx.db.patch(id, updates);
    return await ctx.db.get(id);
  },
});

export const softDelete = mutation({
  args: { id: v.id("packages") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { active: false });
  },
});
