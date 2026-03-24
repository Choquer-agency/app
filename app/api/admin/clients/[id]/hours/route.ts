import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getClientHourCap } from "@/lib/time-entries";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const clientId = id;
  }

  const { searchParams } = new URL(request.url);
  // Default to first day of current month
  const now = new Date();
  const month = searchParams.get("month") || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const summary = await getClientHourCap(clientId, month);
  return NextResponse.json(summary);
}
