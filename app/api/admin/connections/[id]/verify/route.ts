import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { verifyAndUpdateConnection } from "@/lib/connections";
import { hasPermission } from "@/lib/permissions";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.roleLevel, "connections:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const success = await verifyAndUpdateConnection(id);
    return NextResponse.json({ success });
  } catch (error) {
    console.error("Connection verify error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
