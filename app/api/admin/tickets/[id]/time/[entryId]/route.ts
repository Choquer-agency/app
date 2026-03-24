import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { editTimeEntry, deleteTimeEntry, stopTimer } from "@/lib/time-entries";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { entryId } = await params;
  const entryIdNum = parseInt(entryId, 10);
  if (isNaN(entryIdNum)) {
    return NextResponse.json({ error: "Invalid entry ID" }, { status: 400 });
  }

  const body = await request.json();

  // Stop timer action
  if (body.action === "stop") {
    const entry = await stopTimer(entryIdNum);
    if (!entry) {
      return NextResponse.json({ error: "Timer not found or already stopped" }, { status: 404 });
    }
    return NextResponse.json(entry);
  }

  // Edit entry
  const entry = await editTimeEntry(entryIdNum, {
    startTime: body.startTime,
    endTime: body.endTime,
    note: body.note,
  });

  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }
  return NextResponse.json(entry);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { entryId } = await params;
  const entryIdNum = parseInt(entryId, 10);
  if (isNaN(entryIdNum)) {
    return NextResponse.json({ error: "Invalid entry ID" }, { status: 400 });
  }

  const deleted = await deleteTimeEntry(entryIdNum);
  if (!deleted) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
