import { NextRequest, NextResponse } from "next/server";
import { processRecurringTickets } from "@/lib/recurring-tickets";

export async function GET(request: NextRequest) {
  // Verify cron secret (skip in dev for manual testing)
  const authHeader = request.headers.get("authorization");
  const isDev = process.env.NODE_ENV === "development";

  if (!isDev && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await processRecurringTickets();
    console.log("[cron/recurring] Results:", results);
    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("[cron/recurring] Error:", err);
    return NextResponse.json(
      { error: "Cron failed", detail: String(err) },
      { status: 500 }
    );
  }
}
