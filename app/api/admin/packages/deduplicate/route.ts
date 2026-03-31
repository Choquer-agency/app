import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const convex = getConvexClient();
    const result = await convex.mutation(api.packages.deduplicate, {});
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to deduplicate packages:", error);
    return NextResponse.json({ error: "Failed to deduplicate packages" }, { status: 500 });
  }
}
