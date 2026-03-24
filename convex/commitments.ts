import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByTicket = query({
  args: {
    ticketId: v.id("tickets"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ticketCommitments")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const create = mutation({
  args: {
    ticketId: v.id("tickets"),
    teamMemberId: v.id("teamMembers"),
    committedDate: v.string(),
    committedById: v.optional(v.id("teamMembers")),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("ticketCommitments", {
      ticketId: args.ticketId,
      teamMemberId: args.teamMemberId,
      committedDate: args.committedDate,
      committedById: args.committedById,
      status: args.status ?? "active",
      notes: args.notes ?? "",
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: {
    id: v.id("ticketCommitments"),
    status: v.optional(v.string()),
    resolvedAt: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return null;

    const updates: Record<string, unknown> = {};
    if (args.status !== undefined) updates.status = args.status;
    if (args.resolvedAt !== undefined) updates.resolvedAt = args.resolvedAt;
    if (args.notes !== undefined) updates.notes = args.notes;

    await ctx.db.patch(args.id, updates);
    return await ctx.db.get(args.id);
  },
});

export const remove = mutation({
  args: { id: v.id("ticketCommitments") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
