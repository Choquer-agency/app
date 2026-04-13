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
  const entryIdNum = entryId;

  const body = await request.json();

  // Stop timer action — enforce that the caller owns the timer
  if (body.action === "stop") {
    try {
      const entry = await stopTimer(entryIdNum, session.teamMemberId);
      if (!entry) {
        return NextResponse.json({ error: "Timer not found or already stopped" }, { status: 404 });
      }
      return NextResponse.json(entry);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to stop timer";
      return NextResponse.json({ error: message }, { status: 403 });
    }
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
  const entryIdNum = entryId;

  const deleted = await deleteTimeEntry(entryIdNum);
  if (!deleted) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
