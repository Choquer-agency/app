import { NextRequest, NextResponse } from "next/server";
import { getAllTeamMembers, addTeamMember, updateTeamMember } from "@/lib/team-members";
import { getSession } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const members = await getAllTeamMembers();
    return NextResponse.json(members);
  } catch (error) {
    console.error("Failed to fetch team members:", error);
    return NextResponse.json({ error: "Failed to fetch team members" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.name?.trim() || !body.email?.trim()) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    const member = await addTeamMember({
      name: body.name.trim(),
      email: body.email.trim(),
      role: body.role || "",
      calLink: body.calLink || "",
      profilePicUrl: body.profilePicUrl || "",
    });

    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    console.error("Failed to add team member:", error);
    const message =
      error instanceof Error && error.message.includes("unique")
        ? "A team member with this email already exists"
        : "Failed to add team member";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const member = await updateTeamMember(body.id, body);
    if (!member) {
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    }

    return NextResponse.json(member);
  } catch (error) {
    console.error("Failed to update team member:", error);
    return NextResponse.json({ error: "Failed to update team member" }, { status: 500 });
  }
}
