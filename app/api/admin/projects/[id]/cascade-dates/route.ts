import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { previewDateCascade, applyDateCascade } from "@/lib/projects";

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

    if (!body.ticketId || !body.newDate || !body.field) {
      return NextResponse.json(
        { error: "ticketId, newDate, and field are required" },
        { status: 400 }
      );
    }

    if (body.field !== "startDate" && body.field !== "dueDate") {
      return NextResponse.json(
        { error: "field must be 'startDate' or 'dueDate'" },
        { status: 400 }
      );
    }

    const previews = await previewDateCascade(
      id,
      body.ticketId,
      body.newDate,
      body.field
    );

    // If confirm is true, apply the cascade
    if (body.confirm) {
      await applyDateCascade(previews);
      return NextResponse.json({ applied: true, count: previews.length });
    }

    // Otherwise return preview
    return NextResponse.json({ previews });
  } catch (error) {
    console.error("Failed to cascade dates:", error);
    return NextResponse.json({ error: "Failed to cascade dates" }, { status: 500 });
  }
}
