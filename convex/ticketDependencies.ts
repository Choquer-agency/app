import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByTicket = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, args) => {
    // Get dependencies where this ticket depends on others
    const dependsOn = await ctx.db
      .query("ticketDependencies")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();

    // Also get reverse dependencies (tickets that depend on this one)
    const dependedOnBy = await ctx.db
      .query("ticketDependencies")
      .withIndex("by_depends_on", (q) =>
        q.eq("dependsOnTicketId", args.ticketId)
      )
      .collect();

    return { dependsOn, dependedOnBy };
  },
});

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // Get all tickets for this project
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_project_archived", (q) =>
        q.eq("projectId", args.projectId).eq("archived", false)
      )
      .collect();

    const ticketIds = new Set(tickets.map((t) => t._id));

    // Fetch dependencies for each ticket
    const allDeps = [];
    for (const ticket of tickets) {
      const deps = await ctx.db
        .query("ticketDependencies")
        .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
        .collect();
      allDeps.push(...deps);
    }

    return allDeps;
  },
});

export const add = mutation({
  args: {
    ticketId: v.id("tickets"),
    dependsOnTicketId: v.id("tickets"),
  },
  handler: async (ctx, args) => {
    // Prevent self-dependency
    if (args.ticketId === args.dependsOnTicketId) {
      throw new Error("A ticket cannot depend on itself");
    }

    // Check for existing dependency to avoid duplicates
    const existing = await ctx.db
      .query("ticketDependencies")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();

    const alreadyExists = existing.some(
      (d) => d.dependsOnTicketId === args.dependsOnTicketId
    );
    if (alreadyExists) {
      return existing.find(
        (d) => d.dependsOnTicketId === args.dependsOnTicketId
      )!;
    }

    const id = await ctx.db.insert("ticketDependencies", {
      ticketId: args.ticketId,
      dependsOnTicketId: args.dependsOnTicketId,
    });
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: {
    ticketId: v.id("tickets"),
    dependsOnTicketId: v.id("tickets"),
  },
  handler: async (ctx, args) => {
    const dependencies = await ctx.db
      .query("ticketDependencies")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();

    const toRemove = dependencies.find(
      (d) => d.dependsOnTicketId === args.dependsOnTicketId
    );
    if (toRemove) {
      await ctx.db.delete(toRemove._id);
    }
  },
});
