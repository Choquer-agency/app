import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getProjectGroups, createProjectGroup, reorderProjectGroups } from "@/lib/project-groups";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const groups = await getProjectGroups(id);
    return NextResponse.json(groups);
  } catch (error) {
    console.error("Failed to fetch groups:", error);
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    // Check if this is a reorder request
    if (body.orderedIds) {
      await reorderProjectGroups(id, body.orderedIds);
      const groups = await getProjectGroups(id);
      return NextResponse.json(groups);
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    }

    const group = await createProjectGroup(
      id,
      body.name.trim(),
      body.color,
      body.sortOrder
    );
    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    console.error("Failed to create group:", error);
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }
}
