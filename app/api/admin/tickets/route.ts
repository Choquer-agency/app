import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getTickets, createTicket } from "@/lib/tickets";
import { TicketStatus, TicketPriority } from "@/types";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");
    const projectId = url.searchParams.get("projectId");
    const status = url.searchParams.get("status");
    const priority = url.searchParams.get("priority");
    const assigneeId = url.searchParams.get("assigneeId");
    const createdById = url.searchParams.get("createdById");
    const parentTicketId = url.searchParams.get("parentTicketId");
    const archived = url.searchParams.get("archived") === "true";
    const isPersonalParam = url.searchParams.get("isPersonal");
    const search = url.searchParams.get("search");
    const startDateActive = url.searchParams.get("startDateActive") === "true";
    const groupBy = url.searchParams.get("groupBy");
    const limit = Number(url.searchParams.get("limit") || "200");
    const offset = Number(url.searchParams.get("offset") || "0");

    const tickets = await getTickets({
      clientId: clientId ? Number(clientId) : undefined,
      projectId: projectId ? Number(projectId) : undefined,
      status: status ? (status.includes(",") ? status.split(",") as TicketStatus[] : status as TicketStatus) : undefined,
      priority: priority ? (priority.includes(",") ? priority.split(",") as TicketPriority[] : priority as TicketPriority) : undefined,
      assigneeId: assigneeId ? Number(assigneeId) : undefined,
      createdById: createdById ? Number(createdById) : undefined,
      parentTicketId: parentTicketId ? Number(parentTicketId) : undefined,
      archived,
      isPersonal: isPersonalParam === "true" ? true : isPersonalParam === "false" ? false : undefined,
      startDateActive,
      search: search || undefined,
      groupBy: groupBy as "status" | "priority" | "assignee" | "client" | undefined,
      limit,
      offset,
    }, {
      teamMemberId: session.teamMemberId,
      roleLevel: session.roleLevel,
    });

    return NextResponse.json(tickets);
  } catch (error) {
    console.error("Failed to fetch tickets:", error);
    return NextResponse.json({ error: "Failed to fetch tickets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const actor = { id: session.teamMemberId, name: session.name };
    const ticket = await createTicket(
      {
        title: body.title.trim(),
        description: body.description,
        descriptionFormat: body.descriptionFormat,
        clientId: body.clientId,
        projectId: body.projectId,
        parentTicketId: body.parentTicketId,
        status: body.status,
        priority: body.priority,
        ticketGroup: body.ticketGroup,
        groupId: body.groupId,
        templateRoleId: body.templateRoleId,
        startDate: body.startDate,
        dueDate: body.dueDate,
        dueTime: body.dueTime,
        sortOrder: body.sortOrder,
        assigneeIds: body.assigneeIds,
        isPersonal: body.isPersonal,
        isMeeting: body.isMeeting,
        dayOffsetStart: body.dayOffsetStart,
        dayOffsetDue: body.dayOffsetDue,
        serviceCategory: body.serviceCategory,
      },
      session.teamMemberId,
      actor
    );

    return NextResponse.json(ticket, { status: 201 });
  } catch (error) {
    console.error("Failed to create ticket:", error);
    return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
  }
}
