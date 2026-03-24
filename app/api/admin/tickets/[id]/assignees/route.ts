import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getTicketAssignees, addAssignee, removeAssignee } from "@/lib/tickets";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const assignees = await getTicketAssignees(id);
    return NextResponse.json(assignees);
  } catch (error) {
    console.error("Failed to fetch assignees:", error);
    return NextResponse.json({ error: "Failed to fetch assignees" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.teamMemberId) {
      return NextResponse.json({ error: "teamMemberId is required" }, { status: 400 });
    }

    const actor = { id: session.teamMemberId, name: session.name };
    const assignee = await addAssignee(id, body.teamMemberId, actor);
    if (!assignee) {
      return NextResponse.json({ error: "Already assigned" }, { status: 409 });
    }
    return NextResponse.json(assignee, { status: 201 });
  } catch (error) {
    console.error("Failed to add assignee:", error);
    return NextResponse.json({ error: "Failed to add assignee" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.teamMemberId) {
      return NextResponse.json({ error: "teamMemberId is required" }, { status: 400 });
    }

    const actor = { id: session.teamMemberId, name: session.name };
    const success = await removeAssignee(id, body.teamMemberId, actor);
    if (!success) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to remove assignee:", error);
    return NextResponse.json({ error: "Failed to remove assignee" }, { status: 500 });
  }
}
