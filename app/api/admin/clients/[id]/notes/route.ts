import { NextRequest, NextResponse } from "next/server";
import { getClientNotes, addNote } from "@/lib/client-notes";
import { getSession } from "@/lib/admin-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || "50");
    const offset = Number(url.searchParams.get("offset") || "0");

    const notes = await getClientNotes(id, limit, offset);
    return NextResponse.json(notes);
  } catch (error) {
    console.error("Failed to fetch notes:", error);
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

export async function POST(
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

    if (!body.content?.trim()) {
      return NextResponse.json({ error: "Note content is required" }, { status: 400 });
    }

    const note = await addNote({
      clientId: id,
      author: session.name,
      noteType: body.noteType || "note",
      content: body.content.trim(),
      metadata: body.metadata,
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error("Failed to add note:", error);
    return NextResponse.json({ error: "Failed to add note" }, { status: 500 });
  }
}
