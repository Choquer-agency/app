import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getRecurringTemplates, createRecurringTemplate } from "@/lib/recurring-tickets";

export async function GET(request: NextRequest) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");
    const active = url.searchParams.get("active");

    const templates = await getRecurringTemplates({
      clientId: clientId ? Number(clientId) : undefined,
      active: active !== null ? active === "true" : undefined,
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error("Failed to fetch recurring templates:", error);
    return NextResponse.json({ error: "Failed to fetch recurring templates" }, { status: 500 });
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
    if (!body.clientId) {
      return NextResponse.json({ error: "Client is required" }, { status: 400 });
    }
    if (!body.recurrenceRule) {
      return NextResponse.json({ error: "Recurrence rule is required" }, { status: 400 });
    }
    if (body.recurrenceDay === undefined || body.recurrenceDay === null) {
      return NextResponse.json({ error: "Recurrence day is required" }, { status: 400 });
    }
    if (!body.nextCreateAt) {
      return NextResponse.json({ error: "Next create date is required" }, { status: 400 });
    }

    const template = await createRecurringTemplate(
      {
        title: body.title.trim(),
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
      },
      session.teamMemberId
    );

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("Failed to create recurring template:", error);
    return NextResponse.json({ error: "Failed to create recurring template" }, { status: 500 });
  }
}
