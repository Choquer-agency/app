import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getMemberMeetingData } from "@/lib/commitments";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get("memberId");

  if (!memberId) {
    return NextResponse.json({ error: "memberId required" }, { status: 400 });
  }

  try {
    const period = searchParams.get("period") || "last_week";
    const data = await getMemberMeetingData(memberId, period);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to fetch meeting data:", error);
    return NextResponse.json({ error: "Failed to fetch meeting data" }, { status: 500 });
  }
}
