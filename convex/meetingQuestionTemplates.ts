import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByMember = query({
  args: { teamMemberId: v.id("teamMembers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("meetingQuestionTemplates")
      .withIndex("by_member", (q) => q.eq("teamMemberId", args.teamMemberId))
      .collect();
  },
});

export const create = mutation({
  args: {
    teamMemberId: v.id("teamMembers"),
    question: v.string(),
    frequency: v.string(),
    sortOrder: v.optional(v.number()),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("meetingQuestionTemplates", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("meetingQuestionTemplates"),
    question: v.optional(v.string()),
    frequency: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updates[key] = value;
    }
    await ctx.db.patch(id, updates);
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("meetingQuestionTemplates") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
