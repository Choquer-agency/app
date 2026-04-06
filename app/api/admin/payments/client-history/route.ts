import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

const convex = getConvexClient();

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientName = request.nextUrl.searchParams.get("clientName");
  if (!clientName) {
    return NextResponse.json({ error: "clientName is required" }, { status: 400 });
  }

  try {
    const transactions = await convex.query(api.convergeTransactions.listByClientName, {
      clientName,
    });

    const approved = transactions.filter((t: any) => t.status === "approved");
    const refunds = transactions.filter((t: any) => t.status === "refund");
    const declined = transactions.filter((t: any) => t.status === "declined");
    const totalPaid = approved.reduce((s: number, t: any) => s + t.amount, 0);
    const totalRefunded = refunds.reduce((s: number, t: any) => s + t.amount, 0);

    // Group by month
    const months = new Map<string, any[]>();
    for (const t of transactions) {
      if (!t.txnTime) continue;
      const d = new Date(t.txnTime);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!months.has(key)) months.set(key, []);
      months.get(key)!.push(t);
    }

    const monthlyGroups = [...months.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, txns]) => {
        const monthApproved = txns.filter((t: any) => t.status === "approved");
        const monthRefunds = txns.filter((t: any) => t.status === "refund");
        return {
          month,
          label: new Date(month + "-15").toLocaleDateString("en-US", { month: "long", year: "numeric" }),
          transactions: txns,
          approvedCount: monthApproved.length,
          totalCollected: monthApproved.reduce((s: number, t: any) => s + t.amount, 0),
          refundCount: monthRefunds.length,
          totalRefunded: monthRefunds.reduce((s: number, t: any) => s + t.amount, 0),
        };
      });

    return NextResponse.json({
      clientName,
      transactions,
      monthlyGroups,
      summary: {
        totalPaid: Math.round(totalPaid * 100) / 100,
        totalRefunded: Math.round(totalRefunded * 100) / 100,
        paymentCount: approved.length,
        declinedCount: declined.length,
        firstPayment: transactions.reduce((earliest: string | null, t: any) => {
          if (!t.txnTime) return earliest;
          if (!earliest) return t.txnTime;
          return new Date(t.txnTime) < new Date(earliest) ? t.txnTime : earliest;
        }, null as string | null),
        lastPayment: approved.length > 0 ? approved[0].txnTime : null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch history" },
      { status: 500 }
    );
  }
}
