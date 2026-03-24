import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  args: {
    clientId: v.optional(v.id("clients")),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Use the most specific index available
    if (args.clientId !== undefined) {
      const results = await ctx.db
        .query("recurringTicketTemplates")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId!))
        .collect();
      if (args.active !== undefined) {
        return results.filter((r) => r.active === args.active);
      }
      return results;
    }

    if (args.active !== undefined) {
      return await ctx.db
        .query("recurringTicketTemplates")
        .withIndex("by_active", (q) => q.eq("active", args.active!))
        .collect();
    }

    return await ctx.db.query("recurringTicketTemplates").collect();
  },
});

export const getById = query({
  args: { id: v.id("recurringTicketTemplates") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    descriptionFormat: v.optional(v.string()),
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
    priority: v.optional(v.string()),
    ticketGroup: v.optional(v.string()),
    recurrenceRule: v.string(),
    recurrenceDay: v.optional(v.number()),
    nextCreateAt: v.string(),
    active: v.optional(v.boolean()),
    createdById: v.optional(v.id("teamMembers")),
    assigneeIds: v.optional(v.array(v.id("teamMembers"))),
  },
  handler: async (ctx, args) => {
    const { assigneeIds, ...templateData } = args;

    const id = await ctx.db.insert("recurringTicketTemplates", {
      ...templateData,
      active: args.active ?? true,
    });

    // Add assignees to the junction table
    if (assigneeIds && assigneeIds.length > 0) {
      for (const memberId of assigneeIds) {
        await ctx.db.insert("recurringTemplateAssignees", {
          templateId: id,
          teamMemberId: memberId,
        });
      }
    }

    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: {
    id: v.id("recurringTicketTemplates"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    descriptionFormat: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    priority: v.optional(v.string()),
    ticketGroup: v.optional(v.string()),
    recurrenceRule: v.optional(v.string()),
    recurrenceDay: v.optional(v.number()),
    nextCreateAt: v.optional(v.string()),
    active: v.optional(v.boolean()),
    assigneeIds: v.optional(v.array(v.id("teamMembers"))),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return null;

    const { id, assigneeIds, ...fields } = args;
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        updates[key] = value;
      }
    }

    await ctx.db.patch(id, updates);

    // Update assignees if provided
    if (assigneeIds !== undefined) {
      // Remove existing assignees
      const existingAssignees = await ctx.db
        .query("recurringTemplateAssignees")
        .withIndex("by_template", (q) => q.eq("templateId", id))
        .collect();
      for (const a of existingAssignees) {
        await ctx.db.delete(a._id);
      }
      // Add new assignees
      for (const memberId of assigneeIds) {
        await ctx.db.insert("recurringTemplateAssignees", {
          templateId: id,
          teamMemberId: memberId,
        });
      }
    }

    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("recurringTicketTemplates") },
  handler: async (ctx, args) => {
    // Remove assignees first
    const assignees = await ctx.db
      .query("recurringTemplateAssignees")
      .withIndex("by_template", (q) => q.eq("templateId", args.id))
      .collect();
    for (const a of assignees) {
      await ctx.db.delete(a._id);
    }

    await ctx.db.delete(args.id);
  },
});
