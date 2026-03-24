import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { generateMonthlyEmail, getServiceBoardEntryById } from "@/lib/service-board";

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
    await generateMonthlyEmail(Number(id));
    const updated = await getServiceBoardEntryById(Number(id));
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Generate email error:", error);
    return NextResponse.json({ error: "Failed to generate email" }, { status: 500 });
  }
}
