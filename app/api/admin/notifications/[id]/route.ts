import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { dismissApproval } from "@/lib/db";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isDev = process.env.NODE_ENV === "development";
  if (!isDev && !getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const approvalId = id;

  await dismissApproval(approvalId);
  return NextResponse.json({ success: true });
}
