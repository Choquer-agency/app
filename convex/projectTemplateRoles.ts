import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projectTemplateRoles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("projectTemplateRoles", {
      projectId: args.projectId,
      name: args.name,
      sortOrder: args.sortOrder ?? 0,
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: {
    id: v.id("projectTemplateRoles"),
    name: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        updates[key] = value;
      }
    }
    await ctx.db.patch(id, updates);
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("projectTemplateRoles") },
  handler: async (ctx, args) => {
    // Delete any ticket template role assignments referencing this role
    const assignments = await ctx.db
      .query("ticketTemplateRoleAssignments")
      .withIndex("by_role", (q) => q.eq("templateRoleId", args.id))
      .collect();
    for (const assignment of assignments) {
      await ctx.db.delete(assignment._id);
    }
    await ctx.db.delete(args.id);
  },
});
