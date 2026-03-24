import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { updateSavedView, deleteSavedView } from "@/lib/saved-views";

export async function PUT(
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

    const view = await updateSavedView(id, session.teamMemberId, body);
    if (!view) {
      return NextResponse.json({ error: "Saved view not found" }, { status: 404 });
    }
    return NextResponse.json(view);
  } catch (error) {
    console.error("Failed to update saved view:", error);
    return NextResponse.json({ error: "Failed to update saved view" }, { status: 500 });
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
    const success = await deleteSavedView(id, session.teamMemberId);
    if (!success) {
      return NextResponse.json({ error: "Saved view not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete saved view:", error);
    return NextResponse.json({ error: "Failed to delete saved view" }, { status: 500 });
  }
}
