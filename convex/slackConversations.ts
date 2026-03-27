import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const getByThreadTs = query({
  args: { threadTs: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("slackConversations")
      .withIndex("by_threadTs", (q) => q.eq("threadTs", args.threadTs))
      .unique();
  },
});

export const create = mutation({
  args: {
    threadTs: v.string(),
    channelId: v.string(),
    intent: v.string(),
    state: v.string(),
    data: v.any(),
    userId: v.id("teamMembers"),
  },
  handler: async (ctx, args) => {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const id = await ctx.db.insert("slackConversations", {
      threadTs: args.threadTs,
      channelId: args.channelId,
      intent: args.intent,
      state: args.state,
      data: args.data,
      userId: args.userId,
      expiresAt,
      updatedAt: new Date().toISOString(),
    });
    return await ctx.db.get(id);
  },
});

export const updateByThreadTs = mutation({
  args: {
    threadTs: v.string(),
    state: v.optional(v.string()),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("slackConversations")
      .withIndex("by_threadTs", (q) => q.eq("threadTs", args.threadTs))
      .unique();
    if (!doc) return null;

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (args.state !== undefined) updates.state = args.state;
    if (args.data !== undefined) updates.data = args.data;

    await ctx.db.patch(doc._id, updates);
    return await ctx.db.get(doc._id);
  },
});

export const cleanExpired = mutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();
    const expired = await ctx.db
      .query("slackConversations")
      .take(100);
    let count = 0;
    for (const doc of expired) {
      if (doc.expiresAt && doc.expiresAt < now) {
        await ctx.db.delete(doc._id);
        count++;
      }
    }
    return count;
  },
});
