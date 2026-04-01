import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByTicket = query({
  args: {
    ticketId: v.id("tickets"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ticketComments")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .order("asc")
      .take(args.limit ?? 100);
  },
});

export const create = mutation({
  args: {
    ticketId: v.id("tickets"),
    authorType: v.optional(v.string()),
    authorId: v.optional(v.id("teamMembers")),
    authorName: v.string(),
    authorEmail: v.optional(v.string()),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("ticketComments", {
      ticketId: args.ticketId,
      authorType: args.authorType ?? "team",
      authorId: args.authorId,
      authorName: args.authorName,
      authorEmail: args.authorEmail ?? "",
      content: args.content,
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: {
    id: v.id("ticketComments"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return null;

    await ctx.db.patch(args.id, { content: args.content });
    return await ctx.db.get(args.id);
  },
});

export const getById = query({
  args: { id: v.id("ticketComments") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const remove = mutation({
  args: { id: v.id("ticketComments") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
