import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { markEmailSent, getServiceBoardEntryById, isQuarterlyMonth } from "@/lib/service-board";

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
    const body = await request.json().catch(() => ({}));

    // Determine if quarterly from request body or auto-detect from entry month
    const entry = await getServiceBoardEntryById(id);
    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isQuarterly = body.isQuarterly ?? isQuarterlyMonth(entry.month);

    const updated = await markEmailSent(id, isQuarterly);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Service board send-email error:", error);
    return NextResponse.json({ error: "Failed to mark email sent" }, { status: 500 });
  }
}
