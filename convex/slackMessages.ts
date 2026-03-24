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

export const create = mutation({
  args: {
    teamMemberId: v.id("teamMembers"),
    messageType: v.string(),
    messageText: v.string(),
    slackTs: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("slackMessages", {
      teamMemberId: args.teamMemberId,
      messageType: args.messageType,
      messageText: args.messageText,
      slackTs: args.slackTs,
    });
  },
});
