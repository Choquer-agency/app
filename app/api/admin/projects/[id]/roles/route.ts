import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getTemplateRoles, createTemplateRole, reorderTemplateRoles } from "@/lib/project-template-roles";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const roles = await getTemplateRoles(Number(id));
    return NextResponse.json(roles);
  } catch (error) {
    console.error("Failed to fetch roles:", error);
    return NextResponse.json({ error: "Failed to fetch roles" }, { status: 500 });
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
      await reorderTemplateRoles(Number(id), body.orderedIds);
      const roles = await getTemplateRoles(Number(id));
      return NextResponse.json(roles);
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Role name is required" }, { status: 400 });
    }

    const role = await createTemplateRole(
      Number(id),
      body.name.trim(),
      body.sortOrder
    );
    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    console.error("Failed to create role:", error);
    return NextResponse.json({ error: "Failed to create role" }, { status: 500 });
  }
}
