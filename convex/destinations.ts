import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("destinations").order("desc").collect();
  },
});

export const getById = query({
  args: { id: v.id("destinations") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
    type: v.string(),
    name: v.string(),
    createdById: v.optional(v.id("teamMembers")),
    encryptedConfig: v.string(),
    configIv: v.string(),
    connectionId: v.id("apiConnections"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("destinations", {
      ...args,
      status: "active",
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("destinations"),
    name: v.optional(v.string()),
    encryptedConfig: v.optional(v.string()),
    configIv: v.optional(v.string()),
    connectionId: v.optional(v.id("apiConnections")),
    status: v.optional(v.string()),
    lastTestedAt: v.optional(v.string()),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) updates[k] = v;
    }
    await ctx.db.patch(id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("destinations") },
  handler: async (ctx, { id }) => {
    // Reject if still referenced by an active syncJob
    const references = await ctx.db
      .query("syncJobs")
      .withIndex("by_destination", (q) => q.eq("destinationId", id))
      .filter((q) => q.eq(q.field("active"), true))
      .first();
    if (references) {
      throw new Error("Cannot delete — destination is used by an active sync.");
    }
    await ctx.db.delete(id);
  },
});
