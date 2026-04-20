import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getClientById } from "@/lib/clients";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.roleLevel, "clients:edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const clientId = body?.clientId as string | undefined;
    if (!clientId) {
      return NextResponse.json({ error: "clientId required" }, { status: 400 });
    }

    const client = await getClientById(clientId);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const convex = getConvexClient();
    const [monthsDeleted, snapshotsDeleted] = await Promise.all([
      convex.mutation(api.seoStrategyMonths.deleteAllForClient, {
        clientId: clientId as Id<"clients">,
      }),
      convex.mutation(api.enrichedContent.deleteAllForClient, {
        clientSlug: client.slug,
      }),
    ]);

    return NextResponse.json({
      clientSlug: client.slug,
      monthsDeleted,
      snapshotsDeleted,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
