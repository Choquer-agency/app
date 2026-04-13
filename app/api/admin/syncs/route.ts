import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.roleLevel, "connections:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  const activeOnly = searchParams.get("activeOnly") === "true";
  const jobs = await getConvexClient().query(api.syncJobs.list, {
    clientId: (clientId as any) ?? undefined,
    activeOnly,
  });
  return NextResponse.json({ syncs: jobs });
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.roleLevel, "connections:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const {
    name,
    clientId,
    sourcePlatform,
    destinationId,
    metrics,
    dimensions,
    dateRangePreset,
    filters,
    rowLimit,
    frequency,
    dayOfWeek,
    hourOfDay,
  } = body ?? {};

  if (!clientId || !sourcePlatform || !destinationId || !metrics || !frequency) {
    return NextResponse.json(
      { error: "clientId, sourcePlatform, destinationId, metrics, frequency required" },
      { status: 400 }
    );
  }

  // Schedule first run: in ~1 minute so user can see it trigger on the next cron tick
  const nextRunAt = Date.now() + 60 * 1000;

  const id = await getConvexClient().mutation(api.syncJobs.create, {
    name: name || `${sourcePlatform} → destination (${frequency})`,
    clientId: clientId as any,
    sourcePlatform,
    destinationId: destinationId as any,
    metrics,
    dimensions: dimensions ?? [],
    dateRangePreset: dateRangePreset ?? "last_7_days",
    filters,
    rowLimit,
    frequency,
    dayOfWeek,
    hourOfDay,
    nextRunAt,
    createdById: session.teamMemberId as any,
  });

  return NextResponse.json({ id }, { status: 201 });
}
