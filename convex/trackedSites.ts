import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("trackedSites").collect();
  },
});

export const getByKey = query({
  args: { siteKey: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("trackedSites")
      .withIndex("by_siteKey", (q) => q.eq("siteKey", args.siteKey))
      .unique();
  },
});

export const get = query({
  args: { id: v.id("trackedSites") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    domain: v.string(),
    siteKey: v.string(),
    clientId: v.optional(v.id("clients")),
    excludedIps: v.optional(v.array(v.string())),
    consentMode: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("trackedSites", {
      name: args.name,
      domain: args.domain,
      siteKey: args.siteKey,
      clientId: args.clientId,
      active: true,
      excludedIps: args.excludedIps ?? [],
      consentMode: args.consentMode ?? false,
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: {
    id: v.id("trackedSites"),
    name: v.optional(v.string()),
    domain: v.optional(v.string()),
    active: v.optional(v.boolean()),
    excludedIps: v.optional(v.array(v.string())),
    consentMode: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(id, patch);
    }
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("trackedSites") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { active: false });
  },
});
