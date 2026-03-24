import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByMember = query({
  args: { teamMemberId: v.id("teamMembers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("savedViews")
      .withIndex("by_member", (q) => q.eq("teamMemberId", args.teamMemberId))
      .collect();
  },
});

export const create = mutation({
  args: {
    teamMemberId: v.id("teamMembers"),
    name: v.string(),
    filters: v.any(),
    isDefault: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // If setting as default, unset other defaults first
    if (args.isDefault) {
      const existing = await ctx.db
        .query("savedViews")
        .withIndex("by_member", (q) => q.eq("teamMemberId", args.teamMemberId))
        .collect();
      for (const view of existing) {
        if (view.isDefault) {
          await ctx.db.patch(view._id, { isDefault: false });
        }
      }
    }

    const id = await ctx.db.insert("savedViews", {
      teamMemberId: args.teamMemberId,
      name: args.name,
      filters: args.filters,
      isDefault: args.isDefault ?? false,
      sortOrder: args.sortOrder ?? 0,
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: {
    id: v.id("savedViews"),
    name: v.optional(v.string()),
    filters: v.optional(v.any()),
    isDefault: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return null;

    // If setting as default, unset other defaults first
    if (args.isDefault && !existing.isDefault) {
      const views = await ctx.db
        .query("savedViews")
        .withIndex("by_member", (q) =>
          q.eq("teamMemberId", existing.teamMemberId)
        )
        .collect();
      for (const view of views) {
        if (view.isDefault && view._id !== args.id) {
          await ctx.db.patch(view._id, { isDefault: false });
        }
      }
    }

    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.filters !== undefined) updates.filters = args.filters;
    if (args.isDefault !== undefined) updates.isDefault = args.isDefault;
    if (args.sortOrder !== undefined) updates.sortOrder = args.sortOrder;

    await ctx.db.patch(args.id, updates);
    return await ctx.db.get(args.id);
  },
});

export const remove = mutation({
  args: { id: v.id("savedViews") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
