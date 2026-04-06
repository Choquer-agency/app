import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { getTransactions } from "@/lib/converge";

const convex = getConvexClient();

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const isDev = process.env.NODE_ENV === "development";

  if (!isDev && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = new Date();
    const startOfMonth = `${String(today.getMonth() + 1).padStart(2, "0")}/01/${today.getFullYear()}`;

    // Build client lookups for enrichment
    const profiles = await convex.query(api.convergeProfiles.list, {});
    const clientIds = [...new Set(profiles.map((p: any) => p.clientId))];
    const clientMap = new Map<string, string>();
    for (const cid of clientIds) {
      const client = await convex.query(api.clients.getById, { id: cid as any });
      if (client) clientMap.set(cid as string, client.name);
    }

    const byRecurringId = new Map<string, string>();
    const byCard = new Map<string, string>();
    for (const p of profiles) {
      const name = clientMap.get(p.clientId as string);
      if (!name) continue;
      byRecurringId.set(p.recurringId, name);
      if (p.cardLastFour) byCard.set(p.cardLastFour, name);
    }

    // Fetch from Converge
    const fresh = await getTransactions(startOfMonth);

    // Enrich
    const enriched = fresh.map((t) => {
      let clientName: string | undefined;
      if (t.recurringId && byRecurringId.has(t.recurringId)) {
        clientName = byRecurringId.get(t.recurringId);
      } else if (t.cardLastFour && byCard.has(t.cardLastFour)) {
        clientName = byCard.get(t.cardLastFour);
      }

      return {
        ...t,
        firstName: t.firstName || undefined,
        lastName: t.lastName || undefined,
        company: t.company || undefined,
        description: t.description || undefined,
        txnType: t.txnType || undefined,
        refundedAmount: t.refundedAmount || undefined,
        cardType: t.cardType || undefined,
        cardLastFour: t.cardLastFour || undefined,
        cardExpiryMonth: t.cardExpiryMonth || undefined,
        cardExpiryYear: t.cardExpiryYear || undefined,
        recurringId: t.recurringId || undefined,
        txnTime: t.txnTime || undefined,
        settleTime: t.settleTime || undefined,
        approvalCode: t.approvalCode || undefined,
        clientName,
      };
    });

    // Store in Convex
    let inserted = 0;
    for (let i = 0; i < enriched.length; i += 50) {
      const batch = await convex.mutation(api.convergeTransactions.upsertBatch, {
        transactions: enriched.slice(i, i + 50),
      });
      inserted += batch.inserted;
    }

    console.log(`[transaction-sync] Synced ${fresh.length} transactions, ${inserted} new`);
    return NextResponse.json({ synced: fresh.length, inserted });
  } catch (error) {
    console.error("[transaction-sync] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
