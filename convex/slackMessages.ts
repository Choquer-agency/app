import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByMember = query({
  args: { teamMemberId: v.id("teamMembers"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("slackMessages")
      .withIndex("by_member", (q) => q.eq("teamMemberId", args.teamMemberId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const getBySlackTs = query({
  args: { slackTs: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("slackMessages")
      .withIndex("by_slackTs", (q) => q.eq("slackTs", args.slackTs))
      .unique();
  },
});

export const create = mutation({
  args: {
    teamMemberId: v.id("teamMembers"),
    messageType: v.string(),
    messageText: v.string(),
    slackTs: v.optional(v.string()),
    channelId: v.optional(v.string()),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("slackMessages", {
      teamMemberId: args.teamMemberId,
      messageType: args.messageType,
      messageText: args.messageText,
      slackTs: args.slackTs,
      channelId: args.channelId,
      data: args.data,
    });
  },
});
