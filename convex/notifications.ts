import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByRecipient = query({
  args: {
    recipientId: v.id("teamMembers"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("notifications")
      .withIndex("by_recipient", (q) => q.eq("recipientId", args.recipientId))
      .order("desc")
      .take(args.limit ?? 30);
  },
});

export const getUnreadCount = query({
  args: { recipientId: v.id("teamMembers") },
  handler: async (ctx, args) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_unread", (q) =>
        q.eq("recipientId", args.recipientId).eq("isRead", false)
      )
      .collect();
    return unread.length;
  },
});

export const create = mutation({
  args: {
    recipientId: v.id("teamMembers"),
    ticketId: v.optional(v.id("tickets")),
    type: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    link: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("notifications", {
      recipientId: args.recipientId,
      ticketId: args.ticketId,
      type: args.type,
      title: args.title,
      body: args.body ?? "",
      link: args.link ?? "",
      isRead: false,
    });
    return await ctx.db.get(id);
  },
});

export const markRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { isRead: true });
  },
});

export const markAllRead = mutation({
  args: { recipientId: v.id("teamMembers") },
  handler: async (ctx, args) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_unread", (q) =>
        q.eq("recipientId", args.recipientId).eq("isRead", false)
      )
      .collect();

    for (const notification of unread) {
      await ctx.db.patch(notification._id, { isRead: true });
    }
  },
});
