import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    results: ["Migration complete - using Convex"],
  });
}
