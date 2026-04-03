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

export const remove = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
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

// Auto-dismiss: mark all unread notifications of a specific type as read for a recipient
export const markReadByType = mutation({
  args: {
    recipientId: v.id("teamMembers"),
    type: v.string(),
  },
  handler: async (ctx, args) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_unread", (q) =>
        q.eq("recipientId", args.recipientId).eq("isRead", false)
      )
      .collect();

    let count = 0;
    for (const n of unread) {
      if (n.type === args.type) {
        await ctx.db.patch(n._id, { isRead: true });
        count++;
      }
    }
    return count;
  },
});

// Auto-dismiss: mark all unread notifications for a specific ticket as read
export const markReadByTicket = mutation({
  args: {
    recipientId: v.id("teamMembers"),
    ticketId: v.id("tickets"),
  },
  handler: async (ctx, args) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_unread", (q) =>
        q.eq("recipientId", args.recipientId).eq("isRead", false)
      )
      .collect();

    let count = 0;
    for (const n of unread) {
      if (n.ticketId === args.ticketId) {
        await ctx.db.patch(n._id, { isRead: true });
        count++;
      }
    }
    return count;
  },
});

// One-time: mark all notifications as read for every member
export const markAllReadForAllMembers = mutation({
  args: {},
  handler: async (ctx) => {
    const unread = await ctx.db
      .query("notifications")
      .filter((q) => q.eq(q.field("isRead"), false))
      .collect();

    for (const n of unread) {
      await ctx.db.patch(n._id, { isRead: true });
    }
    return unread.length;
  },
});
