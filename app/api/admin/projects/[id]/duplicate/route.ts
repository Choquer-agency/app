import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { duplicateProject } from "@/lib/projects";

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

    if (!body.clientId) {
      return NextResponse.json({ error: "Client is required" }, { status: 400 });
    }
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }
    if (!body.startDate) {
      return NextResponse.json({ error: "Start date is required" }, { status: 400 });
    }

    const project = await duplicateProject(
      Number(id),
      body.clientId,
      body.name.trim(),
      body.startDate,
      body.roleAssignments // Record<roleId, teamMemberId> for auto-assignment
    );

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Failed to duplicate project:", error);
    const message = error instanceof Error ? error.message : "Failed to duplicate project";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
