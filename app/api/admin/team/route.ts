import { NextRequest, NextResponse } from "next/server";
import { getAllTeamMembers, addTeamMember, updateTeamMember, deleteTeamMember } from "@/lib/team-members";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { TeamMember } from "@/types";

function stripWages(member: TeamMember): TeamMember {
  return { ...member, hourlyRate: null, salary: null, payType: "hourly" };
}

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const members = await getAllTeamMembers();
    const canSeeWages = hasPermission(session.roleLevel, "team:view_wages");
    return NextResponse.json(canSeeWages ? members : members.map(stripWages));
  } catch (error) {
    console.error("Failed to fetch team members:", error);
    return NextResponse.json({ error: "Failed to fetch team members" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.name?.trim() || !body.email?.trim()) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    // Gate wage fields
    const wageData = hasPermission(session.roleLevel, "team:edit_wages")
      ? { hourlyRate: body.hourlyRate, salary: body.salary, payType: body.payType }
      : {};

    // Gate role/status assignment
    const roleData = hasPermission(session.roleLevel, "team:manage_roles")
      ? { roleLevel: body.roleLevel, employeeStatus: body.employeeStatus }
      : {};

    const member = await addTeamMember({
      name: body.name.trim(),
      email: body.email.trim(),
      role: body.role || "",
      calLink: body.calLink || "",
      profilePicUrl: body.profilePicUrl || "",
      color: body.color || "",
      startDate: body.startDate || "",
      birthday: body.birthday || "",
      slackUserId: body.slackUserId || "",
      tags: Array.isArray(body.tags) ? body.tags : [],
      ...wageData,
      ...roleData,
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
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    // Strip wage fields if user lacks permission
    if (!hasPermission(session.roleLevel, "team:edit_wages")) {
      delete body.hourlyRate;
      delete body.salary;
      delete body.payType;
    }

    // Strip role/status changes if user lacks permission
    if (!hasPermission(session.roleLevel, "team:manage_roles")) {
      delete body.roleLevel;
      delete body.employeeStatus;
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

export async function DELETE(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.roleLevel, "team:manage_roles")) {
    return NextResponse.json({ error: "Only the owner can delete team members" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  // Can't delete yourself
  if (String(id) === String(session.teamMemberId)) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  try {
    const success = await deleteTeamMember(id);
    if (!success) {
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete team member:", error);
    return NextResponse.json({ error: "Failed to delete team member" }, { status: 500 });
  }
}
