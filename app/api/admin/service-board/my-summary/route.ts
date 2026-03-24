import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getSession } from "@/lib/admin-auth";
import { ServiceBoardCategory } from "@/types";

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

    // Get all service board entries where the specialist is the current user
    const { rows } = await sql`
      SELECT sbe.id, sbe.category, sbe.status, sbe.client_id,
        c.name AS client_name
      FROM service_board_entries sbe
      JOIN clients c ON c.id = sbe.client_id
      WHERE sbe.specialist_id = ${session.teamMemberId}
        AND sbe.month = ${month}::date
        AND sbe.category != 'retainer'
      ORDER BY sbe.category, c.name
    `;

    if (rows.length === 0) {
      return NextResponse.json({ summaries: [] });
    }

    // Group by category
    const byCategory = new Map<string, { total: number; completed: number; clients: Array<{ id: number; name: string; status: string }> }>();

    for (const row of rows) {
      const cat = row.category as string;
      if (!byCategory.has(cat)) {
        byCategory.set(cat, { total: 0, completed: 0, clients: [] });
      }
      const group = byCategory.get(cat)!;
      group.total++;
      // "email_sent" counts as completed for the month
      if (row.status === "email_sent") {
        group.completed++;
      }
      group.clients.push({
        id: row.client_id as number,
        name: row.client_name as string,
        status: row.status as string,
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
