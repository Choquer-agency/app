import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// === Queries ===

export const list = query({
  args: {
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    parentTicketId: v.optional(v.id("tickets")),
    assigneeId: v.optional(v.id("teamMembers")),
    createdById: v.optional(v.id("teamMembers")),
    status: v.optional(v.union(v.string(), v.array(v.string()))),
    priority: v.optional(v.union(v.string(), v.array(v.string()))),
    archived: v.optional(v.boolean()),
    isPersonal: v.optional(v.boolean()),
    serviceCategory: v.optional(v.string()),
    search: v.optional(v.string()),
    startDateActive: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const archived = args.archived ?? false;
    const limit = args.limit ?? 200;
    const offset = args.offset ?? 0;
    const startDateActive = args.startDateActive ?? false;

    // Normalize status/priority filters into arrays
    const statusFilter = args.status
      ? Array.isArray(args.status)
        ? args.status
        : [args.status]
      : null;
    const priorityFilter = args.priority
      ? Array.isArray(args.priority)
        ? args.priority
        : [args.priority]
      : null;

    // Pick the best index to start from
    let baseQuery;
    if (args.clientId !== undefined) {
      baseQuery = ctx.db
        .query("tickets")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId!));
    } else if (args.projectId !== undefined) {
      baseQuery = ctx.db
        .query("tickets")
        .withIndex("by_project_archived", (q) =>
          q.eq("projectId", args.projectId!).eq("archived", archived)
        );
    } else if (args.parentTicketId !== undefined) {
      baseQuery = ctx.db
        .query("tickets")
        .withIndex("by_parent", (q) =>
          q.eq("parentTicketId", args.parentTicketId!)
        );
    } else {
      baseQuery = ctx.db
        .query("tickets")
        .withIndex("by_archived", (q) => q.eq("archived", archived));
    }

    // If filtering by assignee, pre-fetch the set of ticket IDs assigned to them
    let assigneeTicketIds: Set<string> | null = null;
    if (args.assigneeId) {
      const assignments = await ctx.db
        .query("ticketAssignees")
        .withIndex("by_member", (q) => q.eq("teamMemberId", args.assigneeId!))
        .collect();
      assigneeTicketIds = new Set(assignments.map((a) => a.ticketId));
    }

    // Collect all candidates then apply JS filters
    const allTickets = await baseQuery.collect();

    const now = new Date().toISOString().split("T")[0];

    const filtered = allTickets.filter((t) => {
      // Archived filter (if not already handled by index)
      if (args.projectId === undefined && (t.archived ?? false) !== archived) return false;
      // Client filter (if not handled by index)
      if (args.clientId !== undefined && t.clientId !== args.clientId) return false;
      // Parent ticket filter (if not handled by index)
      if (args.parentTicketId !== undefined && t.parentTicketId !== args.parentTicketId) return false;
      // Created-by filter
      if (args.createdById !== undefined && t.createdById !== args.createdById) return false;
      // Assignee filter
      if (assigneeTicketIds && !assigneeTicketIds.has(t._id)) return false;
      // Status filter
      if (statusFilter && !statusFilter.includes(t.status)) return false;
      // Priority filter
      if (priorityFilter && !priorityFilter.includes(t.priority ?? "normal")) return false;
      // Search filter
      if (args.search) {
        const s = args.search.toLowerCase();
        if (
          !t.title.toLowerCase().includes(s) &&
          !t.ticketNumber.toLowerCase().includes(s)
        )
          return false;
      }
      // Service category filter — only applied when explicitly viewing a service board
      if (args.serviceCategory !== undefined) {
        if (t.serviceCategory !== args.serviceCategory) return false;
      }
      // isPersonal filter
      if (args.isPersonal === true && !t.isPersonal) return false;
      if (args.isPersonal === false && t.isPersonal) return false;
      // Start date active filter
      if (startDateActive && t.startDate && t.startDate > now) return false;

      return true;
    });

    // Sort: due date ascending (nulls last), then creation time ascending
    filtered.sort((a, b) => {
      const aDue = a.dueDate ?? "9999-99-99";
      const bDue = b.dueDate ?? "9999-99-99";
      if (aDue !== bDue) return aDue < bDue ? -1 : 1;
      return a._creationTime - b._creationTime;
    });

    // Apply offset + limit
    const page = filtered.slice(offset, offset + limit);

    // Enrich with client names and assignees
    const clientCache = new Map<string, string>();
    const enriched = await Promise.all(
      page.map(async (t) => {
        let clientName: string | undefined;
        if (t.clientId) {
          if (clientCache.has(t.clientId)) {
            clientName = clientCache.get(t.clientId);
          } else {
            const client = await ctx.db.get(t.clientId);
            clientName = client?.name;
            if (clientName) clientCache.set(t.clientId, clientName);
          }
        }

        // Fetch assignees
        const assigneeDocs = await ctx.db
          .query("ticketAssignees")
          .withIndex("by_ticket", (q) => q.eq("ticketId", t._id))
          .collect();
        const assignees = await Promise.all(
          assigneeDocs.map(async (a) => {
            const member = await ctx.db.get(a.teamMemberId);
            return {
              _id: a._id,
              _creationTime: a._creationTime,
              ticketId: a.ticketId,
              teamMemberId: a.teamMemberId,
              memberName: member?.name,
              memberEmail: member?.email,
              memberColor: member?.color,
              memberProfilePicUrl: member?.profilePicUrl,
            };
          })
        );

        return { ...t, clientName, assignees };
      })
    );

    return enriched;
  },
});

export const getById = query({
  args: { id: v.id("tickets") },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.id);
    if (!ticket) return null;

    // Fetch assignees
    const assigneeRows = await ctx.db
      .query("ticketAssignees")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.id))
      .collect();

    const assignees = [];
    for (const row of assigneeRows) {
      const member = await ctx.db.get(row.teamMemberId);
      assignees.push({
        _id: row._id,
        ticketId: row.ticketId,
        teamMemberId: row.teamMemberId,
        assignedAt: row._creationTime,
        memberName: member?.name,
        memberEmail: member?.email,
        memberColor: member?.color,
        memberProfilePicUrl: member?.profilePicUrl,
      });
    }

    // Fetch sub-ticket count
    const subTickets = await ctx.db
      .query("tickets")
      .withIndex("by_parent", (q) => q.eq("parentTicketId", args.id))
      .collect();
    const subTicketCount = subTickets.filter((t) => !t.archived).length;

    // Fetch comment count
    const comments = await ctx.db
      .query("ticketComments")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.id))
      .collect();

    // Fetch client name
    let clientName: string | undefined;
    if (ticket.clientId) {
      const client = await ctx.db.get(ticket.clientId);
      clientName = client?.name;
    }

    // Fetch created-by name
    let createdByName: string | undefined;
    if (ticket.createdById) {
      const member = await ctx.db.get(ticket.createdById);
      createdByName = member?.name;
    }

    // Fetch project name
    let projectName: string | undefined;
    if (ticket.projectId) {
      const project = await ctx.db.get(ticket.projectId);
      projectName = project?.name;
    }

    return {
      ...ticket,
      assignees,
      subTicketCount,
      commentCount: comments.length,
      clientName,
      createdByName,
      projectName,
    };
  },
});

export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const searchLower = args.query.toLowerCase();

    // Fetch non-archived tickets and filter by title/number match
    const allTickets = await ctx.db
      .query("tickets")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect();

    const matches = allTickets.filter(
      (t) =>
        t.title.toLowerCase().includes(searchLower) ||
        t.ticketNumber.toLowerCase().includes(searchLower)
    );

    // Sort by creation time descending (newest first)
    matches.sort((a, b) => b._creationTime - a._creationTime);

    return matches.slice(0, limit);
  },
});

// === Mutations ===

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    descriptionFormat: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    parentTicketId: v.optional(v.id("tickets")),
    status: v.optional(v.string()),
    priority: v.optional(v.string()),
    ticketGroup: v.optional(v.string()),
    groupId: v.optional(v.id("projectGroups")),
    templateRoleId: v.optional(v.id("projectTemplateRoles")),
    startDate: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    dueTime: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    createdById: v.optional(v.id("teamMembers")),
    isPersonal: v.optional(v.boolean()),
    isMeeting: v.optional(v.boolean()),
    isEmail: v.optional(v.boolean()),
    assignAllRoles: v.optional(v.boolean()),
    dayOffsetStart: v.optional(v.number()),
    dayOffsetDue: v.optional(v.number()),
    serviceCategory: v.optional(v.string()),
    assigneeIds: v.optional(v.array(v.id("teamMembers"))),
  },
  handler: async (ctx, args) => {
    // Generate CHQ-XXX ticket number atomically
    const counter = await ctx.db
      .query("counters")
      .withIndex("by_name", (q) => q.eq("name", "ticket_number"))
      .unique();
    const next = (counter?.value ?? 0) + 1;
    if (counter) {
      await ctx.db.patch(counter._id, { value: next });
    } else {
      await ctx.db.insert("counters", { name: "ticket_number", value: next });
    }
    const ticketNumber = `CHQ-${String(next).padStart(3, "0")}`;

    // Auto-tag service_category from client's active packages if not provided
    let serviceCategory = args.serviceCategory;
    if (!serviceCategory && args.clientId) {
      const clientPackages = await ctx.db
        .query("clientPackages")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId!))
        .collect();
      const activePackages = clientPackages.filter((cp) => cp.active);

      // Check each package's category, priority: retainer > seo > google_ads
      let bestCategory: string | undefined;
      let bestPriority = 999;
      for (const cp of activePackages) {
        const pkg = await ctx.db.get(cp.packageId);
        if (pkg?.category) {
          const p =
            pkg.category === "retainer"
              ? 1
              : pkg.category === "seo"
                ? 2
                : pkg.category === "google_ads"
                  ? 3
                  : 999;
          if (p < bestPriority) {
            bestPriority = p;
            bestCategory = pkg.category;
          }
        }
      }
      if (bestCategory) {
        serviceCategory = bestCategory;
      }
    }

    const ticketId = await ctx.db.insert("tickets", {
      ticketNumber,
      title: args.title,
      description: args.description ?? "",
      descriptionFormat: args.descriptionFormat ?? "plain",
      clientId: args.clientId,
      projectId: args.projectId,
      parentTicketId: args.parentTicketId,
      status: args.status ?? "needs_attention",
      priority: args.priority ?? "normal",
      ticketGroup: args.ticketGroup ?? "",
      groupId: args.groupId,
      templateRoleId: args.templateRoleId,
      startDate: args.startDate,
      dueDate: args.dueDate,
      dueTime: args.dueTime,
      sortOrder: args.sortOrder ?? 0,
      createdById: args.createdById,
      isPersonal: args.isPersonal ?? false,
      isMeeting: args.isMeeting ?? false,
      isEmail: args.isEmail ?? false,
      assignAllRoles: args.assignAllRoles ?? false,
      dayOffsetStart: args.dayOffsetStart,
      dayOffsetDue: args.dayOffsetDue,
      serviceCategory,
      archived: false,
    });

    // Add assignees if provided
    if (args.assigneeIds && args.assigneeIds.length > 0) {
      for (const memberId of args.assigneeIds) {
        await ctx.db.insert("ticketAssignees", {
          ticketId,
          teamMemberId: memberId,
        });
      }
    }

    return await ctx.db.get(ticketId);
  },
});

export const update = mutation({
  args: {
    id: v.id("tickets"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    descriptionFormat: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    parentTicketId: v.optional(v.id("tickets")),
    status: v.optional(v.string()),
    priority: v.optional(v.string()),
    ticketGroup: v.optional(v.string()),
    groupId: v.optional(v.id("projectGroups")),
    templateRoleId: v.optional(v.id("projectTemplateRoles")),
    startDate: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    dueTime: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    archived: v.optional(v.boolean()),
    isPersonal: v.optional(v.boolean()),
    isMeeting: v.optional(v.boolean()),
    isEmail: v.optional(v.boolean()),
    assignAllRoles: v.optional(v.boolean()),
    dayOffsetStart: v.optional(v.number()),
    dayOffsetDue: v.optional(v.number()),
    serviceCategory: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const current = await ctx.db.get(id);
    if (!current) return null;

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        updates[key] = value;
      }
    }

    // Auto-manage closedAt
    if (fields.status !== undefined) {
      if (fields.status === "closed" && current.status !== "closed") {
        updates.closedAt = new Date().toISOString();
      } else if (fields.status !== "closed" && current.status === "closed") {
        updates.closedAt = undefined;
      }
    }

    await ctx.db.patch(id, updates);
    return await ctx.db.get(id);
  },
});

export const archive = mutation({
  args: { id: v.id("tickets") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { archived: true });
    return true;
  },
});

export const restore = mutation({
  args: { id: v.id("tickets") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { archived: false });
    return true;
  },
});

export const bulkUpdateStatus = mutation({
  args: {
    ticketIds: v.array(v.id("tickets")),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.ticketIds.length === 0) return 0;

    let count = 0;
    for (const ticketId of args.ticketIds) {
      const current = await ctx.db.get(ticketId);
      if (!current) continue;

      const updates: Record<string, unknown> = { status: args.status };

      // Auto-manage closedAt
      if (args.status === "closed" && current.status !== "closed") {
        updates.closedAt = new Date().toISOString();
      } else if (args.status !== "closed" && current.status === "closed") {
        updates.closedAt = undefined;
      }

      await ctx.db.patch(ticketId, updates);
      count++;
    }
    return count;
  },
});

export const bulkAssign = mutation({
  args: {
    ticketIds: v.array(v.id("tickets")),
    teamMemberId: v.id("teamMembers"),
    action: v.union(v.literal("add"), v.literal("remove")),
  },
  handler: async (ctx, args) => {
    if (args.ticketIds.length === 0) return 0;

    let count = 0;

    for (const ticketId of args.ticketIds) {
      if (args.action === "add") {
        // Check if assignment already exists
        const existing = await ctx.db
          .query("ticketAssignees")
          .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
          .collect();
        const alreadyAssigned = existing.some(
          (a) => a.teamMemberId === args.teamMemberId
        );
        if (!alreadyAssigned) {
          await ctx.db.insert("ticketAssignees", {
            ticketId,
            teamMemberId: args.teamMemberId,
          });
          count++;
        }
      } else {
        // Remove assignment
        const existing = await ctx.db
          .query("ticketAssignees")
          .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
          .collect();
        const assignment = existing.find(
          (a) => a.teamMemberId === args.teamMemberId
        );
        if (assignment) {
          await ctx.db.delete(assignment._id);
          count++;
        }
      }
    }
    return count;
  },
});

export const reorder = mutation({
  args: {
    items: v.array(
      v.object({
        id: v.id("tickets"),
        sortOrder: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let count = 0;
    for (const item of args.items) {
      await ctx.db.patch(item.id, { sortOrder: item.sortOrder });
      count++;
    }
    return count;
  },
});

// === Assignee Helpers ===

export const getAssignees = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("ticketAssignees")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();

    const assignees = [];
    for (const row of rows) {
      const member = await ctx.db.get(row.teamMemberId);
      assignees.push({
        _id: row._id,
        ticketId: row.ticketId,
        teamMemberId: row.teamMemberId,
        assignedAt: row._creationTime,
        memberName: member?.name,
        memberEmail: member?.email,
        memberColor: member?.color,
        memberProfilePicUrl: member?.profilePicUrl,
      });
    }
    return assignees;
  },
});

export const addAssignee = mutation({
  args: {
    ticketId: v.id("tickets"),
    teamMemberId: v.id("teamMembers"),
  },
  handler: async (ctx, args) => {
    // Check for existing assignment
    const existing = await ctx.db
      .query("ticketAssignees")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();
    const alreadyAssigned = existing.some(
      (a) => a.teamMemberId === args.teamMemberId
    );
    if (alreadyAssigned) return null;

    const id = await ctx.db.insert("ticketAssignees", {
      ticketId: args.ticketId,
      teamMemberId: args.teamMemberId,
    });
    return await ctx.db.get(id);
  },
});

export const removeAssignee = mutation({
  args: {
    ticketId: v.id("tickets"),
    teamMemberId: v.id("teamMembers"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ticketAssignees")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();
    const assignment = existing.find(
      (a) => a.teamMemberId === args.teamMemberId
    );
    if (!assignment) return false;
    await ctx.db.delete(assignment._id);
    return true;
  },
});

// List tickets by assignee (for reports and meeting prep)
export const listByAssignee = query({
  args: {
    teamMemberId: v.id("teamMembers"),
    archived: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const assignees = await ctx.db
      .query("ticketAssignees")
      .withIndex("by_member", (q) => q.eq("teamMemberId", args.teamMemberId))
      .collect();

    const ticketIds = assignees.map((a) => a.ticketId);
    const tickets = [];
    for (const ticketId of ticketIds) {
      const ticket = await ctx.db.get(ticketId);
      if (ticket && (args.archived === undefined || ticket.archived === args.archived)) {
        // Enrich with client name
        const client = ticket.clientId ? await ctx.db.get(ticket.clientId) : null;
        tickets.push({
          ...ticket,
          clientName: client?.name ?? null,
        });
      }
    }
    return tickets.slice(0, args.limit ?? 500);
  },
});
