import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { updateTemplateRole, deleteTemplateRole } from "@/lib/project-template-roles";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { roleId } = await params;
    const body = await request.json();
    const role = await updateTemplateRole(Number(roleId), body);
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }
    return NextResponse.json(role);
  } catch (error) {
    console.error("Failed to update role:", error);
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { roleId } = await params;
    const deleted = await deleteTemplateRole(Number(roleId));
    if (!deleted) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete role:", error);
    return NextResponse.json({ error: "Failed to delete role" }, { status: 500 });
  }
}
