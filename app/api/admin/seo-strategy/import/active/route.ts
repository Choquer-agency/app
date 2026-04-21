import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export const dynamic = "force-dynamic";

interface ActiveJob {
  clientId: string;
  clientName: string;
  total: number;
  idle: number;
  queued: number;
  running: number;
  error: number;
  lastEditedAt: number;
}

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.roleLevel, "seo_import:use")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const convex = getConvexClient();
    const rows = await convex.query(api.seoStrategyMonths.listAllImportSummaries, {});
    const jobs: ActiveJob[] = rows.map((r: any) => ({
      clientId: r.clientId,
      clientName: r.clientName,
      total: r.total,
      idle: r.idle,
      queued: r.queued,
      running: r.running,
      error: r.error,
      lastEditedAt: r.lastEditedAt,
    }));
    return NextResponse.json({ jobs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
