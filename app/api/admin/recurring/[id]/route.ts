import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import {
  getRecurringTemplateById,
  updateRecurringTemplate,
  deleteRecurringTemplate,
} from "@/lib/recurring-tickets";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const template = await getRecurringTemplateById(id);
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    return NextResponse.json(template);
  } catch (error) {
    console.error("Failed to fetch recurring template:", error);
    return NextResponse.json({ error: "Failed to fetch template" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const template = await updateRecurringTemplate(id, {
      title: body.title,
      description: body.description,
      descriptionFormat: body.descriptionFormat,
      clientId: body.clientId,
      projectId: body.projectId,
      priority: body.priority,
      ticketGroup: body.ticketGroup,
      recurrenceRule: body.recurrenceRule,
      recurrenceDay: body.recurrenceDay,
      nextCreateAt: body.nextCreateAt,
      active: body.active,
      assigneeIds: body.assigneeIds,
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json(template);
  } catch (error) {
    console.error("Failed to update recurring template:", error);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const success = await deleteRecurringTemplate(id);
    if (!success) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete recurring template:", error);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
