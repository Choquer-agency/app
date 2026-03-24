import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getTicketDependencies, addTicketDependency, removeTicketDependency } from "@/lib/projects";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const deps = await getTicketDependencies(id);
    return NextResponse.json(deps);
  } catch (error) {
    console.error("Failed to fetch dependencies:", error);
    return NextResponse.json({ error: "Failed to fetch dependencies" }, { status: 500 });
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
    if (!body.dependsOnTicketId) {
      return NextResponse.json({ error: "dependsOnTicketId is required" }, { status: 400 });
    }
    await addTicketDependency(id, body.dependsOnTicketId);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Failed to add dependency:", error);
    return NextResponse.json({ error: "Failed to add dependency" }, { status: 500 });
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
    const body = await request.json();
    if (!body.dependsOnTicketId) {
      return NextResponse.json({ error: "dependsOnTicketId is required" }, { status: 400 });
    }
    await removeTicketDependency(id, body.dependsOnTicketId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to remove dependency:", error);
    return NextResponse.json({ error: "Failed to remove dependency" }, { status: 500 });
  }
}
