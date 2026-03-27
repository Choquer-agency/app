import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const create = mutation({
  args: {
    ticketId: v.id("tickets"),
    reportedById: v.id("teamMembers"),
    blockedById: v.optional(v.id("teamMembers")),
    blockerDescription: v.string(),
    acknowledged: v.boolean(),
    escalatedToOwner: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("blockerEscalations", {
      ticketId: args.ticketId,
      reportedById: args.reportedById,
      blockedById: args.blockedById,
      blockerDescription: args.blockerDescription,
      acknowledged: args.acknowledged,
      escalatedToOwner: args.escalatedToOwner,
    });
  },
});

export const listUnacknowledged = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("blockerEscalations")
      .withIndex("by_acknowledged", (q) => q.eq("acknowledged", false))
      .take(50);
  },
});

export const listByTicket = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("blockerEscalations")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .order("desc")
      .take(10);
  },
});

export const acknowledge = mutation({
  args: { id: v.id("blockerEscalations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      acknowledged: true,
      acknowledgedAt: new Date().toISOString(),
    });
  },
});

export const markEscalated = mutation({
  args: { id: v.id("blockerEscalations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      escalatedToOwner: true,
      escalatedAt: new Date().toISOString(),
    });
  },
});

export const resolve = mutation({
  args: { id: v.id("blockerEscalations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      acknowledged: true,
      resolvedAt: new Date().toISOString(),
    });
  },
});
