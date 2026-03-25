import {
  Ticket,
  TicketAssignee,
  TicketStatus,
  TicketPriority,
} from "@/types";

export function docToTicket(doc: any): Ticket {
  return {
    id: doc._id,
    ticketNumber: doc.ticketNumber ?? "",
    title: doc.title ?? "",
    description: doc.description ?? "",
    descriptionFormat: doc.descriptionFormat ?? "plain",
    clientId: doc.clientId ?? null,
    projectId: doc.projectId ?? null,
    parentTicketId: doc.parentTicketId ?? null,
    status: doc.status as TicketStatus,
    priority: (doc.priority as TicketPriority) ?? "normal",
    ticketGroup: doc.ticketGroup ?? "",
    groupId: doc.groupId ?? null,
    templateRoleId: doc.templateRoleId ?? null,
    startDate: doc.startDate ?? null,
    dueDate: doc.dueDate ?? null,
    dueTime: doc.dueTime ?? null,
    sortOrder: doc.sortOrder ?? 0,
    createdById: doc.createdById ?? null,
    archived: doc.archived ?? false,
    isPersonal: doc.isPersonal ?? false,
    isMeeting: doc.isMeeting ?? false,
    isEmail: doc.isEmail ?? false,
    assignAllRoles: doc.assignAllRoles ?? false,
    dayOffsetStart: doc.dayOffsetStart ?? null,
    dayOffsetDue: doc.dayOffsetDue ?? null,
    serviceCategory: doc.serviceCategory ?? null,
    closedAt: doc.closedAt ?? null,
    createdAt: doc._creationTime
      ? new Date(doc._creationTime).toISOString()
      : new Date().toISOString(),
    updatedAt: doc.updatedAt ?? new Date().toISOString(),
    // Joined fields (may or may not be present)
    clientName: doc.clientName ?? undefined,
    createdByName: doc.createdByName ?? undefined,
    projectName: doc.projectName ?? undefined,
    subTicketCount: doc.subTicketCount ?? undefined,
    commentCount: doc.commentCount ?? undefined,
    groupName: doc.groupName ?? undefined,
    templateRoleName: doc.templateRoleName ?? undefined,
    assignees: doc.assignees
      ? doc.assignees.map(docToAssignee)
      : undefined,
  };
}

export function docToAssignee(doc: any): TicketAssignee {
  return {
    id: doc._id,
    ticketId: doc.ticketId,
    teamMemberId: doc.teamMemberId,
    assignedAt: doc.assignedAt
      ? new Date(doc.assignedAt).toISOString()
      : doc._creationTime
        ? new Date(doc._creationTime).toISOString()
        : new Date().toISOString(),
    memberName: doc.memberName ?? undefined,
    memberEmail: doc.memberEmail ?? undefined,
    memberColor: doc.memberColor ?? undefined,
    memberProfilePicUrl: doc.memberProfilePicUrl ?? undefined,
  };
}
