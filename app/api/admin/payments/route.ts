import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getTransactions } from "@/lib/converge";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

const convex = getConvexClient();

interface ClientLookups {
  byRecurringId: Map<string, string>;
  byCard: Map<string, string>; // "lastFour-expiryMMYY" -> client name
}

async function buildClientLookups(): Promise<ClientLookups> {
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
    // Index by card last 4 for one-off transaction matching
    if (p.cardLastFour) {
      byCard.set(p.cardLastFour, name);
    }
  }

  return { byRecurringId, byCard };
}

function resolveClientName(
  t: { recurringId?: string | null; cardLastFour?: string | null; cardExpiryMonth?: number | null; cardExpiryYear?: number | null },
  lookups: ClientLookups
): string | undefined {
  // 1. Match by recurring ID (exact)
  if (t.recurringId && lookups.byRecurringId.has(t.recurringId)) {
    return lookups.byRecurringId.get(t.recurringId);
  }
  // 2. Match by card last 4 (same card used for a known client)
  if (t.cardLastFour && lookups.byCard.has(t.cardLastFour)) {
    return lookups.byCard.get(t.cardLastFour);
  }
  return undefined;
}

function formatDateForConverge(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${m}/${d}/${y}`;
}

// GET: Read from Convex (instant). Pass ?sync=true to pull fresh from Converge.
function enrichTransaction(t: any, lookups: ClientLookups) {
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
    clientName: resolveClientName(t, lookups),
  };
}

async function syncFromConverge(startDate: string, endDate: string | undefined, lookups: ClientLookups) {
  const fresh = await getTransactions(startDate, endDate || undefined);
  const enriched = fresh.map((t) => enrichTransaction(t, lookups));

  for (let i = 0; i < enriched.length; i += 50) {
    await convex.mutation(api.convergeTransactions.upsertBatch, {
      transactions: enriched.slice(i, i + 50),
    });
  }

  return enriched;
}

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const startDate = request.nextUrl.searchParams.get("startDate"); // MM/DD/YYYY
    const endDate = request.nextUrl.searchParams.get("endDate");
    const sync = request.nextUrl.searchParams.get("sync") === "true";

    if (!startDate) {
      return NextResponse.json({ error: "startDate is required (MM/DD/YYYY)" }, { status: 400 });
    }

    function toIso(mmddyyyy: string) {
      const [m, d, y] = mmddyyyy.split("/");
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    const isoStart = toIso(startDate);
    const isoEnd = endDate ? toIso(endDate) : new Date().toISOString().split("T")[0];

    // If sync requested or no cached data, pull from Converge
    if (sync) {
      const lookups = await buildClientLookups();
      await syncFromConverge(startDate, endDate || undefined, lookups);
    }

    // Read from Convex (instant)
    let transactions = await convex.query(api.convergeTransactions.listByDateRange, {
      startDate: isoStart,
      endDate: isoEnd,
    });

    // Auto-sync if no cached data
    if (transactions.length === 0 && !sync) {
      const lookups = await buildClientLookups();
      await syncFromConverge(startDate, endDate || undefined, lookups);
      transactions = await convex.query(api.convergeTransactions.listByDateRange, {
        startDate: isoStart,
        endDate: isoEnd,
      });
    }

    // Enrich any unlinked cached transactions with card matching on read
    const lookups = await buildClientLookups();
    const enrichedTransactions = transactions.map((t: any) => {
      if (t.clientName) return t;
      const matched = resolveClientName(t, lookups);
      return matched ? { ...t, clientName: matched } : t;
    });

    return buildResponse(enrichedTransactions);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

function buildResponse(transactions: any[]) {
  const approved = transactions.filter((t: any) => t.status === "approved");
  const declined = transactions.filter((t: any) => t.status === "declined");
  const refunds = transactions.filter((t: any) => t.status === "refund");

  const uniqueDeclined = new Map<string, any>();
  for (const t of declined) {
    const key = t.recurringId || t.txnId;
    if (!uniqueDeclined.has(key)) uniqueDeclined.set(key, t);
  }
  const uniqueDeclinedList = [...uniqueDeclined.values()];
  const uniqueDeclinedAmount = uniqueDeclinedList.reduce((sum: number, t: any) => sum + t.amount, 0);
  const totalCollected = approved.reduce((sum: number, t: any) => sum + t.amount, 0);
  const totalRefunded = refunds.reduce((sum: number, t: any) => sum + t.amount, 0);

  // Sort by time descending
  const sorted = [...transactions].sort((a: any, b: any) => {
    const ta = a.txnTime ? new Date(a.txnTime).getTime() : 0;
    const tb = b.txnTime ? new Date(b.txnTime).getTime() : 0;
    return tb - ta;
  });

  return NextResponse.json({
    transactions: sorted,
    summary: {
      total: transactions.length,
      approvedCount: approved.length,
      declinedCount: uniqueDeclinedList.length,
      declinedRetries: declined.length - uniqueDeclinedList.length,
      totalCollected: Math.round(totalCollected * 100) / 100,
      totalDeclined: Math.round(uniqueDeclinedAmount * 100) / 100,
      refundCount: refunds.length,
      totalRefunded: Math.round(totalRefunded * 100) / 100,
    },
  });
}
