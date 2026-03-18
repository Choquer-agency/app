import { NextRequest, NextResponse } from "next/server";
import { deleteNote } from "@/lib/client-notes";
import { getSession } from "@/lib/admin-auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { noteId } = await params;
    const success = await deleteNote(Number(noteId));

    if (!success) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete note:", error);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
