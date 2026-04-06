import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  args: {
    clientId: v.optional(v.id("clients")),
    isTemplate: v.optional(v.boolean()),
    archived: v.optional(v.boolean()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Start with the most selective index available
    let results;

    if (args.clientId !== undefined) {
      results = await ctx.db
        .query("projects")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId!))
        .collect();
    } else if (args.isTemplate !== undefined) {
      results = await ctx.db
        .query("projects")
        .withIndex("by_template", (q) => q.eq("isTemplate", args.isTemplate!))
        .collect();
    } else if (args.archived !== undefined) {
      results = await ctx.db
        .query("projects")
        .withIndex("by_archived", (q) => q.eq("archived", args.archived!))
        .collect();
    } else if (args.status !== undefined) {
      results = await ctx.db
        .query("projects")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else {
      results = await ctx.db.query("projects").collect();
    }

    // Apply remaining filters in memory
    if (args.clientId !== undefined) {
      // Already filtered by index
    }
    if (args.isTemplate !== undefined && args.clientId !== undefined) {
      results = results.filter((p) => p.isTemplate === args.isTemplate);
    }
    if (args.archived !== undefined && args.clientId !== undefined) {
      results = results.filter((p) => p.archived === args.archived);
    } else if (args.archived !== undefined && args.isTemplate !== undefined) {
      results = results.filter((p) => p.archived === args.archived);
    }
    if (args.status !== undefined && (args.clientId !== undefined || args.isTemplate !== undefined || args.archived !== undefined)) {
      results = results.filter((p) => p.status === args.status);
    }

    return results;
  },
});

export const listByMember = query({
  args: { teamMemberId: v.id("teamMembers") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("projectMembers")
      .withIndex("by_member", (q) => q.eq("teamMemberId", args.teamMemberId))
      .collect();

    const projects = [];
    for (const m of memberships) {
      const project = await ctx.db.get(m.projectId);
      if (project && !project.archived && !project.isTemplate) {
        const client = project.clientId ? await ctx.db.get(project.clientId) : null;
        projects.push({
          ...project,
          clientName: client?.name,
        });
      }
    }
    return projects;
  },
});

export const getById = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    isTemplate: v.optional(v.boolean()),
    status: v.optional(v.string()),
    startDate: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    createdById: v.optional(v.id("teamMembers")),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("projects", {
      name: args.name,
      description: args.description ?? "",
      clientId: args.clientId,
      isTemplate: args.isTemplate ?? false,
      status: args.status ?? "active",
      archived: false,
      startDate: args.startDate,
      dueDate: args.dueDate,
      createdById: args.createdById,
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: {
    id: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    isTemplate: v.optional(v.boolean()),
    status: v.optional(v.string()),
    archived: v.optional(v.boolean()),
    startDate: v.optional(v.string()),
    dueDate: v.optional(v.string()),
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

export const archive = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { archived: true });
    return await ctx.db.get(args.id);
  },
});

export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    // Delete project groups
    const groups = await ctx.db
      .query("projectGroups")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();
    for (const group of groups) {
      await ctx.db.delete(group._id);
    }

    // Delete project template roles
    const roles = await ctx.db
      .query("projectTemplateRoles")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();
    for (const role of roles) {
      // Delete ticket template role assignments for this role
      const roleAssignments = await ctx.db
        .query("ticketTemplateRoleAssignments")
        .withIndex("by_role", (q) => q.eq("templateRoleId", role._id))
        .collect();
      for (const ra of roleAssignments) {
        await ctx.db.delete(ra._id);
      }
      await ctx.db.delete(role._id);
    }

    // Delete project members
    const members = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();
    for (const member of members) {
      await ctx.db.delete(member._id);
    }

    // Delete tickets and their related data
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();
    for (const ticket of tickets) {
      // Delete assignees
      const assignees = await ctx.db
        .query("ticketAssignees")
        .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
        .collect();
      for (const a of assignees) {
        await ctx.db.delete(a._id);
      }
      // Delete dependencies (where this ticket depends on others)
      const deps = await ctx.db
        .query("ticketDependencies")
        .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
        .collect();
      for (const d of deps) {
        await ctx.db.delete(d._id);
      }
      // Delete dependencies (where others depend on this ticket)
      const reverseDeps = await ctx.db
        .query("ticketDependencies")
        .withIndex("by_depends_on", (q) => q.eq("dependsOnTicketId", ticket._id))
        .collect();
      for (const d of reverseDeps) {
        await ctx.db.delete(d._id);
      }
      // Delete template role assignments for this ticket
      const ticketRoleAssignments = await ctx.db
        .query("ticketTemplateRoleAssignments")
        .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
        .collect();
      for (const tra of ticketRoleAssignments) {
        await ctx.db.delete(tra._id);
      }
      // Delete the ticket
      await ctx.db.delete(ticket._id);
    }

    // Delete the project
    await ctx.db.delete(args.id);
  },
});
