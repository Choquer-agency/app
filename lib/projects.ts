import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { Project, CreateProjectInput, ProjectStatus, TicketDependency, ProjectMember, DateCascadePreview } from "@/types";

// === Doc Mappers ===

function docToProject(doc: any): Project {
  return {
    id: doc._id,
    name: doc.name ?? "",
    description: doc.description ?? "",
    clientId: doc.clientId ?? null,
    isTemplate: doc.isTemplate ?? false,
    status: (doc.status as ProjectStatus) ?? "active",
    archived: doc.archived ?? false,
    startDate: doc.startDate ?? null,
    dueDate: doc.dueDate ?? null,
    createdById: doc.createdById ?? null,
    createdAt: doc._creationTime ? new Date(doc._creationTime).toISOString() : undefined,
    updatedAt: undefined,
    // Joined fields (enriched separately)
    clientName: doc.clientName ?? undefined,
    ticketCount: doc.ticketCount ?? undefined,
    completedTicketCount: doc.completedTicketCount ?? undefined,
  };
}

// === Enrichment Helpers ===

async function enrichProject(doc: any): Promise<Project> {
  const convex = getConvexClient();
  const project = docToProject(doc);

  // Fetch client name
  if (project.clientId) {
    try {
      const client = await convex.query(api.clients.getById, { id: project.clientId as any });
      if (client) project.clientName = client.name;
    } catch {}
  }

  // Fetch ticket counts
  try {
    const tickets = await convex.query(api.tickets.list, {
      projectId: doc._id as any,
      archived: false,
      isPersonal: false,
    });
    project.ticketCount = tickets.length;
    project.completedTicketCount = tickets.filter((t: any) => t.status === "closed").length;
  } catch {}

  return project;
}

// === CRUD Operations ===

export async function getProjects(filters: {
  clientId?: string;
  isTemplate?: boolean;
  archived?: boolean;
  search?: string;
} = {}): Promise<Project[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.projects.list, {
    clientId: filters.clientId as any,
    isTemplate: filters.isTemplate,
    archived: filters.archived ?? false,
  });

  // Apply search filter in memory (Convex list doesn't support search)
  let filtered = docs;
  if (filters.search) {
    const s = filters.search.toLowerCase();
    filtered = docs.filter((d: any) => d.name?.toLowerCase().includes(s));
  }

  // Enrich each project with client name + ticket counts
  const projects = await Promise.all(filtered.map(enrichProject));

  // Sort: templates first, then by creation time descending
  projects.sort((a, b) => {
    if (a.isTemplate !== b.isTemplate) return a.isTemplate ? -1 : 1;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });

  return projects;
}

export async function getProjectById(id: string): Promise<Project | null> {
  const convex = getConvexClient();
  const doc = await convex.query(api.projects.getById, { id: id as any });
  if (!doc) return null;
  return enrichProject(doc);
}

export async function createProject(
  data: CreateProjectInput,
  createdById: string
): Promise<Project> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.projects.create, {
    name: data.name,
    description: data.description || "",
    clientId: data.clientId as any,
    isTemplate: data.isTemplate ?? false,
    status: data.status || "active",
    startDate: data.startDate ?? undefined,
    dueDate: data.dueDate ?? undefined,
    createdById: createdById as any,
  });
  return enrichProject(doc);
}

export async function updateProject(
  id: string,
  data: Partial<CreateProjectInput & { status: ProjectStatus; archived: boolean }>
): Promise<Project | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.projects.update, {
    id: id as any,
    name: data.name,
    description: data.description,
    clientId: data.clientId as any,
    isTemplate: data.isTemplate,
    status: data.status,
    archived: data.archived,
    startDate: data.startDate,
    dueDate: data.dueDate,
  } as any);
  if (!doc) return null;
  return enrichProject(doc);
}

export async function archiveProject(id: string): Promise<boolean> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.projects.archive, { id: id as any });
  return !!doc;
}

export async function deleteProject(id: string): Promise<boolean> {
  const convex = getConvexClient();
  await convex.mutation(api.projects.remove, { id: id as any });
  return true;
}

// === Dependencies ===

export async function getTicketDependencies(ticketId: string): Promise<TicketDependency[]> {
  const convex = getConvexClient();
  const result = await convex.query(api.ticketDependencies.listByTicket, { ticketId: ticketId as any });
  const deps = result.dependsOn || [];

  // Enrich with ticket details
  const enriched: TicketDependency[] = [];
  for (const dep of deps) {
    try {
      const ticket = await convex.query(api.tickets.getById, { id: dep.dependsOnTicketId as any });
      enriched.push({
        id: dep._id,
        ticketId: dep.ticketId,
        dependsOnTicketId: dep.dependsOnTicketId,
        dependsOnTicketNumber: ticket?.ticketNumber ?? "",
        dependsOnTicketTitle: ticket?.title ?? "",
        dependsOnTicketStatus: ticket?.status ?? "",
      });
    } catch {
      enriched.push({
        id: dep._id,
        ticketId: dep.ticketId,
        dependsOnTicketId: dep.dependsOnTicketId,
        dependsOnTicketNumber: "",
        dependsOnTicketTitle: "",
        dependsOnTicketStatus: "",
      });
    }
  }
  return enriched;
}

export async function getProjectDependencies(projectId: string): Promise<TicketDependency[]> {
  const convex = getConvexClient();

  // Get all non-archived tickets for this project
  const tickets = await convex.query(api.tickets.list, {
    projectId: projectId as any,
    archived: false,
  });

  // For each ticket, get its dependencies
  const allDeps: TicketDependency[] = [];
  for (const ticket of tickets) {
    const result = await convex.query(api.ticketDependencies.listByTicket, { ticketId: ticket._id as any });
    for (const dep of (result.dependsOn || [])) {
      try {
        const depTicket = await convex.query(api.tickets.getById, { id: dep.dependsOnTicketId as any });
        allDeps.push({
          id: dep._id,
          ticketId: dep.ticketId,
          dependsOnTicketId: dep.dependsOnTicketId,
          dependsOnTicketNumber: depTicket?.ticketNumber ?? "",
          dependsOnTicketTitle: depTicket?.title ?? "",
          dependsOnTicketStatus: depTicket?.status ?? "",
        });
      } catch {
        allDeps.push({
          id: dep._id,
          ticketId: dep.ticketId,
          dependsOnTicketId: dep.dependsOnTicketId,
          dependsOnTicketNumber: "",
          dependsOnTicketTitle: "",
          dependsOnTicketStatus: "",
        });
      }
    }
  }
  return allDeps;
}

export async function addTicketDependency(ticketId: string, dependsOnTicketId: string): Promise<void> {
  const convex = getConvexClient();
  await convex.mutation(api.ticketDependencies.add, {
    ticketId: ticketId as any,
    dependsOnTicketId: dependsOnTicketId as any,
  });
}

export async function removeTicketDependency(ticketId: string, dependsOnTicketId: string): Promise<void> {
  const convex = getConvexClient();
  await convex.mutation(api.ticketDependencies.remove, {
    ticketId: ticketId as any,
    dependsOnTicketId: dependsOnTicketId as any,
  });
}

// === Template Duplication ===

export async function duplicateProject(
  templateId: string,
  clientId: string,
  name: string,
  startDate: string,
  roleAssignments?: Record<string, string> // templateRoleId → teamMemberId
): Promise<Project> {
  const convex = getConvexClient();

  // 1. Fetch template project
  const template = await convex.query(api.projects.getById, { id: templateId as any });
  if (!template || !template.isTemplate) {
    throw new Error("Template not found");
  }

  // 2. Calculate due date from template
  const newDueDate = template.dueDate && template.startDate
    ? adjustForWeekend(addDaysToDate(startDate, daysBetween(template.startDate, template.dueDate)))
    : undefined;

  // 3. Create new project
  const newProject = await convex.mutation(api.projects.create, {
    name,
    description: template.description ?? "",
    clientId: clientId as any,
    isTemplate: false,
    status: "active",
    startDate,
    dueDate: newDueDate,
    createdById: template.createdById as any,
  });
  const newProjectId = newProject._id;

  // 4. Clone groups → build groupIdMap
  const groups = await convex.query(api.projectGroups.listByProject, { projectId: templateId as any });
  const groupIdMap = new Map<string, string>();
  // Sort by sortOrder
  const sortedGroups = [...groups].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const group of sortedGroups) {
    const newGroup = await convex.mutation(api.projectGroups.create, {
      projectId: newProjectId as any,
      name: group.name,
      color: group.color,
      sortOrder: group.sortOrder ?? 0,
    });
    groupIdMap.set(group._id, newGroup._id);
  }

  // 5. Fetch all template tickets (non-archived, non-personal)
  const templateTickets = await convex.query(api.tickets.list, {
    projectId: templateId as any,
    archived: false,
    isPersonal: false,
  });

  // Sort: parent tickets first (no parentTicketId), then by sortOrder
  const sorted = [...templateTickets].sort((a: any, b: any) => {
    if (!a.parentTicketId && b.parentTicketId) return -1;
    if (a.parentTicketId && !b.parentTicketId) return 1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  // 6. Clone each ticket with weekend-aware dates
  const idMap = new Map<string, string>();
  const allTeamTicketIds = new Set<string>();

  for (const ticket of sorted) {
    // Calculate dates from offsets with weekend adjustment
    const newStartDate = ticket.dayOffsetStart != null
      ? adjustForWeekend(addDaysToDate(startDate, ticket.dayOffsetStart))
      : undefined;
    const newDueDateTicket = ticket.dayOffsetDue != null
      ? adjustForWeekend(addDaysToDate(startDate, ticket.dayOffsetDue))
      : undefined;

    // Remap parent_ticket_id if it's a sub-ticket
    const newParentId = ticket.parentTicketId
      ? idMap.get(ticket.parentTicketId) ?? undefined
      : undefined;

    // Remap group_id
    const newGroupId = ticket.groupId
      ? groupIdMap.get(ticket.groupId) ?? undefined
      : undefined;

    const newTicket = await convex.mutation(api.tickets.create, {
      title: ticket.title,
      description: ticket.description || "",
      descriptionFormat: ticket.descriptionFormat || "plain",
      clientId: clientId as any,
      projectId: newProjectId as any,
      parentTicketId: newParentId as any,
      status: "needs_attention",
      priority: ticket.priority || "normal",
      ticketGroup: ticket.ticketGroup || "",
      groupId: newGroupId as any,
      startDate: newStartDate,
      dueDate: newDueDateTicket,
      dueTime: ticket.dueTime,
      sortOrder: ticket.sortOrder ?? 0,
      createdById: ticket.createdById as any,
      isPersonal: false,
      isMeeting: ticket.isMeeting ?? false,
      dayOffsetStart: ticket.dayOffsetStart,
      dayOffsetDue: ticket.dayOffsetDue,
    });

    idMap.set(ticket._id, newTicket._id);
    if (ticket.assignAllRoles) {
      allTeamTicketIds.add(newTicket._id);
    }
  }

  // 7. Auto-assign based on role mapping
  if (roleAssignments && Object.keys(roleAssignments).length > 0) {
    const allAssignedMembers = [...new Set(Object.values(roleAssignments).filter(Boolean))];

    // Assign "All Team" tickets to every role-assigned member
    for (const ticketId of allTeamTicketIds) {
      for (const memberId of allAssignedMembers) {
        await convex.mutation(api.tickets.addAssignee, {
          ticketId: ticketId as any,
          teamMemberId: memberId as any,
        });
      }
    }

    // Look up role assignments from the junction table for each original ticket
    // We need to check ticketTemplateRoleAssignments for each template ticket
    for (const [origId, newId] of idMap.entries()) {
      if (allTeamTicketIds.has(newId)) continue; // Already assigned above

      // Get role assignments for the original ticket
      const roleAssignmentsForTicket = await convex.query(api.ticketAssignees.listByTicket, { ticketId: origId as any });

      // We need the template role assignments - query them individually
      // Since there's no direct query, we check each role
      for (const [roleId, memberId] of Object.entries(roleAssignments)) {
        if (!memberId) continue;
        // Check if this original ticket had this role assigned via ticketTemplateRoleAssignments
        // We'll query all roles and check
      }
    }

    // Better approach: for each template ticket, get its role assignments and map them
    for (const ticket of sorted) {
      const newTicketId = idMap.get(ticket._id);
      if (!newTicketId || allTeamTicketIds.has(newTicketId)) continue;

      // The ticket may have a templateRoleId directly or via junction table
      // Check the ticket's templateRoleId field first
      if (ticket.templateRoleId && roleAssignments[ticket.templateRoleId]) {
        await convex.mutation(api.tickets.addAssignee, {
          ticketId: newTicketId as any,
          teamMemberId: roleAssignments[ticket.templateRoleId] as any,
        });
      }
    }
  } else {
    // Fallback: clone existing assignees from template
    for (const ticket of sorted) {
      const newTicketId = idMap.get(ticket._id);
      if (!newTicketId) continue;

      const assignees = await convex.query(api.ticketAssignees.listByTicket, { ticketId: ticket._id as any });
      for (const assignee of assignees) {
        await convex.mutation(api.tickets.addAssignee, {
          ticketId: newTicketId as any,
          teamMemberId: assignee.teamMemberId as any,
        });
      }
    }
  }

  // 8. Clone dependencies
  for (const ticket of sorted) {
    const newTicketId = idMap.get(ticket._id);
    if (!newTicketId) continue;

    const depsResult = await convex.query(api.ticketDependencies.listByTicket, { ticketId: ticket._id as any });
    for (const dep of (depsResult.dependsOn || [])) {
      const newDependsOnId = idMap.get(dep.dependsOnTicketId);
      if (newDependsOnId) {
        await convex.mutation(api.ticketDependencies.add, {
          ticketId: newTicketId as any,
          dependsOnTicketId: newDependsOnId as any,
        });
      }
    }
  }

  return (await getProjectById(newProjectId))!;
}

// === Date Cascading ===

export async function previewDateCascade(
  projectId: string,
  ticketId: string,
  newDate: string,
  field: "startDate" | "dueDate"
): Promise<DateCascadePreview[]> {
  const convex = getConvexClient();

  // Get the ticket being changed
  const ticket = await convex.query(api.tickets.getById, { id: ticketId as any });
  if (!ticket) return [];

  const oldDate = field === "startDate" ? ticket.startDate : ticket.dueDate;
  if (!oldDate) return [];

  const oldDateStr = typeof oldDate === "string" ? oldDate.split("T")[0] : oldDate;
  const delta = daysBetween(oldDateStr, newDate);
  if (delta === 0) return [];

  // Find all tickets in this project
  const tickets = await convex.query(api.tickets.list, {
    projectId: projectId as any,
    archived: false,
  });

  const previews: DateCascadePreview[] = [];

  for (const t of tickets) {
    if (t._id === ticketId) continue;

    if (t.startDate) {
      const oldStart = t.startDate.split("T")[0];
      if (oldStart >= oldDateStr) {
        const shifted = addDaysToDate(oldStart, delta);
        const adjusted = adjustForWeekend(shifted);
        previews.push({
          ticketId: t._id,
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          field: "startDate",
          oldDate: oldStart,
          newDate: adjusted,
          weekendAdjusted: adjusted !== shifted,
        });
      }
    }
    if (t.dueDate) {
      const oldDue = t.dueDate.split("T")[0];
      if (oldDue >= oldDateStr) {
        const shifted = addDaysToDate(oldDue, delta);
        const adjusted = adjustForWeekend(shifted);
        previews.push({
          ticketId: t._id,
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          field: "dueDate",
          oldDate: oldDue,
          newDate: adjusted,
          weekendAdjusted: adjusted !== shifted,
        });
      }
    }
  }

  return previews;
}

export async function applyDateCascade(
  previews: DateCascadePreview[]
): Promise<void> {
  const convex = getConvexClient();
  for (const p of previews) {
    await convex.mutation(api.tickets.update, {
      id: p.ticketId as any,
      [p.field]: p.newDate,
    } as any);
  }
}

// === Project Members ===

export async function getProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.projectMembers.listByProject, { projectId: projectId as any });
  return docs.map((doc: any) => ({
    id: doc._id,
    projectId: doc.projectId,
    teamMemberId: doc.teamMemberId,
    addedAt: doc._creationTime ? new Date(doc._creationTime).toISOString() : undefined,
    memberName: doc.memberName ?? "",
    memberEmail: doc.memberEmail ?? "",
    memberColor: doc.memberColor ?? undefined,
    memberProfilePicUrl: doc.memberProfilePicUrl ?? undefined,
  }));
}

export async function addProjectMember(projectId: string, teamMemberId: string): Promise<void> {
  const convex = getConvexClient();
  await convex.mutation(api.projectMembers.add, {
    projectId: projectId as any,
    teamMemberId: teamMemberId as any,
  });
}

export async function removeProjectMember(projectId: string, teamMemberId: string): Promise<void> {
  const convex = getConvexClient();
  await convex.mutation(api.projectMembers.remove, {
    projectId: projectId as any,
    teamMemberId: teamMemberId as any,
  });
}

/**
 * Get projects for sub-nav: active projects the user is a member of.
 * Admins see all active projects.
 */
export async function getMyProjects(
  teamMemberId: string,
  isAdmin: boolean
): Promise<Project[]> {
  const convex = getConvexClient();

  if (isAdmin) {
    // Admins see all non-archived, non-template projects
    const docs = await convex.query(api.projects.list, {
      archived: false,
      isTemplate: false,
    });
    const projects = await Promise.all(docs.map(enrichProject));
    projects.sort((a, b) => {
      if (a.status !== b.status) return (a.status ?? "").localeCompare(b.status ?? "");
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
    return projects;
  }

  // Non-admin: only projects they're a member of
  const allProjects = await convex.query(api.projects.list, {
    archived: false,
    isTemplate: false,
  });

  // Filter to projects the user is a member of
  const memberProjects: any[] = [];
  for (const project of allProjects) {
    const members = await convex.query(api.projectMembers.listByProject, { projectId: project._id as any });
    const isMember = members.some((m: any) => m.teamMemberId === teamMemberId);
    if (isMember) {
      memberProjects.push(project);
    }
  }

  const projects = await Promise.all(memberProjects.map(enrichProject));
  projects.sort((a, b) => {
    if (a.status !== b.status) return (a.status ?? "").localeCompare(b.status ?? "");
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
  return projects;
}

// === Date Helpers ===

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** If date falls on Saturday or Sunday, push to Monday */
function adjustForWeekend(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00"); // noon to avoid TZ issues
  const day = d.getDay();
  if (day === 6) {
    // Saturday → Monday
    d.setDate(d.getDate() + 2);
  } else if (day === 0) {
    // Sunday → Monday
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split("T")[0];
}

function daysBetween(from: Date | string | null, to: Date | string | null): number {
  if (!from || !to) return 0;
  const a = new Date(from);
  const b = new Date(to);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
