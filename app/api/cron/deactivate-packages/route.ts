import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const isDev = process.env.NODE_ENV === "development";

  if (!isDev && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const convex = getConvexClient();
    const today = new Date().toISOString().split("T")[0];

    // Get all canceled-but-still-active packages
    const canceledActive = await convex.query(api.clientPackages.listCanceledActive, {});

    let deactivated = 0;
    for (const cp of canceledActive as any[]) {
      if (cp.effectiveEndDate && cp.effectiveEndDate <= today) {
        await convex.mutation(api.clientPackages.deactivateExpired, { id: cp._id });
        deactivated++;
      }
    }

    console.log(`[cron/deactivate-packages] Deactivated ${deactivated} expired packages`);
    return NextResponse.json({ success: true, deactivated });
  } catch (err) {
    console.error("[cron/deactivate-packages] Error:", err);
    return NextResponse.json(
      { error: "Cron failed", detail: String(err) },
      { status: 500 }
    );
  }
}
