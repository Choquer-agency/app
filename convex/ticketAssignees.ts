import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByTicket = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ticketAssignees")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();
  },
});

export const listByMember = query({
  args: {
    teamMemberId: v.id("teamMembers"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ticketAssignees")
      .withIndex("by_member", (q) => q.eq("teamMemberId", args.teamMemberId))
      .take(args.limit ?? 200);
  },
});

export const add = mutation({
  args: {
    ticketId: v.id("tickets"),
    teamMemberId: v.id("teamMembers"),
  },
  handler: async (ctx, args) => {
    // Check for existing assignment to avoid duplicates
    const existing = await ctx.db
      .query("ticketAssignees")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();

    const alreadyAssigned = existing.some(
      (a) => a.teamMemberId === args.teamMemberId
    );
    if (alreadyAssigned) return existing.find((a) => a.teamMemberId === args.teamMemberId)!;

    const id = await ctx.db.insert("ticketAssignees", {
      ticketId: args.ticketId,
      teamMemberId: args.teamMemberId,
    });
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: {
    ticketId: v.id("tickets"),
    teamMemberId: v.id("teamMembers"),
  },
  handler: async (ctx, args) => {
    const assignees = await ctx.db
      .query("ticketAssignees")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();

    const toRemove = assignees.find(
      (a) => a.teamMemberId === args.teamMemberId
    );
    if (toRemove) {
      await ctx.db.delete(toRemove._id);
    }
  },
});
