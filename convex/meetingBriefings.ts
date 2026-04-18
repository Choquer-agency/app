import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    teamMemberId: v.id("teamMembers"),
    createdById: v.id("teamMembers"),
    period: v.string(),
    meetingDate: v.string(),
    briefingData: v.any(),
    generationMeta: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("meetingBriefings", args);
  },
});

export const listByMember = query({
  args: {
    teamMemberId: v.id("teamMembers"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("meetingBriefings")
      .withIndex("by_member", (q) => q.eq("teamMemberId", args.teamMemberId))
      .order("desc")
      .take(args.limit ?? 10);
  },
});

export const remove = mutation({
  args: { id: v.id("meetingBriefings") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const getByMemberAndDate = query({
  args: {
    teamMemberId: v.id("teamMembers"),
    meetingDate: v.string(),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("meetingBriefings")
      .withIndex("by_member", (q) => q.eq("teamMemberId", args.teamMemberId))
      .collect();
    return results.find((b) => b.meetingDate === args.meetingDate) ?? null;
  },
});
