import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { resolvePaymentIssue } from "@/lib/payment-issues";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();

    if (body.action === "resolve") {
      await resolvePaymentIssue(id, session.teamMemberId, body.note);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update issue" },
      { status: 500 }
    );
  }
}
