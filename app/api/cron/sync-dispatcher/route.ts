import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { executeSyncJob } from "@/lib/sync/run";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BATCH = 25;

export async function GET(request: NextRequest) {
  // Cron auth — same pattern as other /api/cron routes
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convex = getConvexClient();
  const now = Date.now();
  const due = (await convex.query(api.syncJobs.listDue, {
    before: now,
    limit: MAX_BATCH,
  })) as Array<{ _id: string; name: string }>;

  if (due.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: "no due syncs" });
  }

  const results = await Promise.allSettled(
    due.map((job) => executeSyncJob(job._id as any, "schedule"))
  );

  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ jobId: string; name: string; error: string }> = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      succeeded++;
    } else {
      failed++;
      errors.push({
        jobId: due[i]._id,
        name: due[i].name,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  });

  return NextResponse.json({
    ok: true,
    processed: due.length,
    succeeded,
    failed,
    errors,
  });
}
