import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByMember = query({
  args: { teamMemberId: v.id("teamMembers"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("meetingNotes")
      .withIndex("by_member", (q) => q.eq("teamMemberId", args.teamMemberId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const getById = query({
  args: { id: v.id("meetingNotes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    teamMemberId: v.id("teamMembers"),
    createdById: v.id("teamMembers"),
    transcript: v.optional(v.string()),
    summary: v.optional(v.string()),
    rawExtraction: v.optional(v.any()),
    meetingDate: v.string(),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("meetingNotes", {
      teamMemberId: args.teamMemberId,
      createdById: args.createdById,
      transcript: args.transcript,
      summary: args.summary,
      rawExtraction: args.rawExtraction,
      meetingDate: args.meetingDate,
      source: args.source ?? "manual",
    });
    return await ctx.db.get(id);
  },
});
