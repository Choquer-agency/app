import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByTicket = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ticketTemplateRoleAssignments")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();
  },
});

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // Get all tickets for this project
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const ticketIds = new Set(tickets.map((t) => t._id));

    // Get all assignments and filter to those in this project
    const allAssignments = await ctx.db
      .query("ticketTemplateRoleAssignments")
      .collect();
    return allAssignments.filter((a) => ticketIds.has(a.ticketId));
  },
});

export const add = mutation({
  args: {
    ticketId: v.id("tickets"),
    templateRoleId: v.id("projectTemplateRoles"),
  },
  handler: async (ctx, args) => {
    // Check for existing
    const existing = await ctx.db
      .query("ticketTemplateRoleAssignments")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();
    const match = existing.find((a) => a.templateRoleId === args.templateRoleId);
    if (match) return match._id;

    return await ctx.db.insert("ticketTemplateRoleAssignments", {
      ticketId: args.ticketId,
      templateRoleId: args.templateRoleId,
    });
  },
});

export const remove = mutation({
  args: {
    ticketId: v.id("tickets"),
    templateRoleId: v.id("projectTemplateRoles"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ticketTemplateRoleAssignments")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();
    const match = existing.find((a) => a.templateRoleId === args.templateRoleId);
    if (match) {
      await ctx.db.delete(match._id);
    }
  },
});
