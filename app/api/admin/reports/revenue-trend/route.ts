import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

const convex = getConvexClient();

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session || !hasPermission(session.roleLevel, "report:revenue")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch all stored transactions
    const all = await convex.query(api.convergeTransactions.listByDateRange, {
      startDate: "2024-01-01",
      endDate: "2099-12-31",
    });

    // Group by month and currency
    const months = new Map<string, { usd: number; cad: number; refundUsd: number; refundCad: number; count: number }>();

    for (const t of all) {
      if (!t.txnTime) continue;
      const d = new Date(t.txnTime);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      if (!months.has(key)) {
        months.set(key, { usd: 0, cad: 0, refundUsd: 0, refundCad: 0, count: 0 });
      }
      const m = months.get(key)!;

      if (t.status === "approved") {
        if (t.terminal === "USD") m.usd += t.amount;
        else m.cad += t.amount;
        m.count++;
      } else if (t.status === "refund") {
        if (t.terminal === "USD") m.refundUsd += t.amount;
        else m.refundCad += t.amount;
      }
    }

    // Sort by month ascending
    const trend = [...months.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => ({
        month,
        usd: Math.round(data.usd * 100) / 100,
        cad: Math.round(data.cad * 100) / 100,
        refundUsd: Math.round(data.refundUsd * 100) / 100,
        refundCad: Math.round(data.refundCad * 100) / 100,
        total: Math.round((data.usd + data.cad) * 100) / 100,
        netTotal: Math.round((data.usd + data.cad - data.refundUsd - data.refundCad) * 100) / 100,
        count: data.count,
      }));

    return NextResponse.json({ trend });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
