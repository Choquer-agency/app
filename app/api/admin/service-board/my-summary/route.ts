import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { ServiceBoardCategory } from "@/types";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

/**
 * Returns a summary of service board entries assigned to the current user
 * for the current month, grouped by category. Used for the My Board banner.
 */
export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const monthLabel = now.toLocaleString("en-US", { month: "long" });

    const convex = getConvexClient();

    // Get all service board entries for this month
    const allEntries = await convex.query(api.serviceBoardEntries.list, {});

    // Filter: specialist is current user, correct month, not retainer
    const entries = (allEntries as any[]).filter(
      (e: any) =>
        e.specialistId === session.teamMemberId &&
        e.month === month &&
        e.category !== "retainer"
    );

    if (entries.length === 0) {
      return NextResponse.json({ summaries: [] });
    }

    // Get client names
    const clientIds = [...new Set(entries.map((e: any) => e.clientId))];
    const clientMap = new Map<string, string>();
    for (const clientId of clientIds) {
      const client = await convex.query(api.clients.getById, { id: clientId as any });
      if (client) {
        clientMap.set(clientId, (client as any).name);
      }
    }

    // Group by category
    const byCategory = new Map<string, { total: number; completed: number; clients: Array<{ id: string; name: string; status: string }> }>();

    for (const row of entries) {
      const cat = row.category as string;
      if (!byCategory.has(cat)) {
        byCategory.set(cat, { total: 0, completed: 0, clients: [] });
      }
      const group = byCategory.get(cat)!;
      group.total++;
      if (row.status === "email_sent") {
        group.completed++;
      }
      group.clients.push({
        id: row.clientId,
        name: clientMap.get(row.clientId) || "Unknown",
        status: row.status,
      });
    }

    const summaries = Array.from(byCategory.entries()).map(([category, data]) => ({
      category: category as ServiceBoardCategory,
      categoryLabel: category === "google_ads" ? "Google Ads" : category === "seo" ? "SEO" : "Retainer",
      month: monthLabel,
      total: data.total,
      completed: data.completed,
      clients: data.clients,
    }));

    return NextResponse.json({ summaries });
  } catch (error) {
    console.error("Service board summary error:", error);
    return NextResponse.json({ error: "Failed to fetch summary" }, { status: 500 });
  }
}
