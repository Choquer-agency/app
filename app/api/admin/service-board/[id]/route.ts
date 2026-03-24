import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getServiceBoardEntryById, updateServiceBoardEntry } from "@/lib/service-board";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const entry = await getServiceBoardEntryById(id);
    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(entry);
  } catch (error) {
    console.error("Service board entry GET error:", error);
    return NextResponse.json({ error: "Failed to fetch entry" }, { status: 500 });
  }
}

export async function PATCH(
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
    const entry = await updateServiceBoardEntry(id, {
      status: body.status,
      specialistId: body.specialistId,
      notes: body.notes,
    });

    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(entry);
  } catch (error) {
    console.error("Service board entry PATCH error:", error);
    return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
  }
}
