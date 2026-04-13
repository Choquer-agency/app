import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.roleLevel, "connections:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  await getConvexClient().mutation(api.syncJobs.update, {
    id: id as any,
    name: body.name,
    metrics: body.metrics,
    dimensions: body.dimensions,
    dateRangePreset: body.dateRangePreset,
    filters: body.filters,
    rowLimit: body.rowLimit,
    frequency: body.frequency,
    dayOfWeek: body.dayOfWeek,
    hourOfDay: body.hourOfDay,
    nextRunAt: body.nextRunAt,
    active: body.active,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.roleLevel, "connections:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await getConvexClient().mutation(api.syncJobs.remove, { id: id as any });
  return NextResponse.json({ ok: true });
}
