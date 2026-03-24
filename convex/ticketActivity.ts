import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByTicket = query({
  args: {
    ticketId: v.id("tickets"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ticketActivity")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const create = mutation({
  args: {
    ticketId: v.id("tickets"),
    actorId: v.optional(v.id("teamMembers")),
    actorName: v.string(),
    actionType: v.string(),
    fieldName: v.optional(v.string()),
    oldValue: v.optional(v.string()),
    newValue: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("ticketActivity", {
      ticketId: args.ticketId,
      actorId: args.actorId,
      actorName: args.actorName,
      actionType: args.actionType,
      fieldName: args.fieldName,
      oldValue: args.oldValue,
      newValue: args.newValue,
      metadata: args.metadata ?? {},
    });
    return await ctx.db.get(id);
  },
});
