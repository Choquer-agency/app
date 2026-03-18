import { NextRequest, NextResponse } from "next/server";
import { getApprovals, updateApprovalStatus } from "@/lib/db";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  try {
    const approvals = await getApprovals(slug);
    return NextResponse.json({ approvals });
  } catch (error) {
    console.error("Approval GET error:", error);
    return NextResponse.json({ error: "Failed to fetch approvals" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { approvalId, status, feedback } = body;

    if (!approvalId || !status) {
      return NextResponse.json({ error: "Missing approvalId or status" }, { status: 400 });
    }

    if (status !== "approved" && status !== "rejected") {
      return NextResponse.json({ error: "Status must be 'approved' or 'rejected'" }, { status: 400 });
    }

    await updateApprovalStatus(approvalId, status, feedback);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Approval POST error:", error);
    return NextResponse.json({ error: "Failed to update approval" }, { status: 500 });
  }
}
