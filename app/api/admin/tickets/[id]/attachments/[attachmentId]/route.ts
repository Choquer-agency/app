import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { deleteAttachment } from "@/lib/ticket-attachments";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, attachmentId } = await params;
    const deleted = await deleteAttachment(Number(attachmentId), Number(id));

    if (!deleted) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete attachment:", error);
    return NextResponse.json({ error: "Failed to delete attachment" }, { status: 500 });
  }
}
