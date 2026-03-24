import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getProjectMembers, addProjectMember, removeProjectMember } from "@/lib/projects";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const members = await getProjectMembers(Number(id));
    return NextResponse.json(members);
  } catch (error) {
    console.error("Failed to fetch project members:", error);
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
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
    const { teamMemberId } = await request.json();
    if (!teamMemberId) {
      return NextResponse.json({ error: "teamMemberId is required" }, { status: 400 });
    }
    await addProjectMember(Number(id), teamMemberId);
    const members = await getProjectMembers(Number(id));
    return NextResponse.json(members, { status: 201 });
  } catch (error) {
    console.error("Failed to add project member:", error);
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
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
    const { teamMemberId } = await request.json();
    if (!teamMemberId) {
      return NextResponse.json({ error: "teamMemberId is required" }, { status: 400 });
    }
    await removeProjectMember(Number(id), teamMemberId);
    const members = await getProjectMembers(Number(id));
    return NextResponse.json(members);
  } catch (error) {
    console.error("Failed to remove project member:", error);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
