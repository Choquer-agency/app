import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import {
  listMonthsForClient,
  saveMonth,
  monthKeyOf,
  classifyStatus,
  EMPTY_TIPTAP_DOC,
} from "@/lib/seo-strategy-months";
import { getClientById } from "@/lib/clients";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { clientId } = await params;
    const client = await getClientById(clientId);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const existing = await listMonthsForClient(clientId);
    const existingKeys = new Set(existing.map((m) => m.monthKey));

    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1;

    const stubsToCreate: { year: number; month: number; monthKey: string }[] = [];
    for (let i = 0; i <= 3; i++) {
      let m = todayMonth + i;
      let y = todayYear;
      while (m > 12) {
        m -= 12;
        y += 1;
      }
      const key = monthKeyOf(y, m);
      if (!existingKeys.has(key)) stubsToCreate.push({ year: y, month: m, monthKey: key });
    }

    const created = await Promise.all(
      stubsToCreate.map((stub) =>
        saveMonth({
          clientId,
          clientSlug: client.slug,
          monthKey: stub.monthKey,
          rawContent: EMPTY_TIPTAP_DOC,
          status: classifyStatus(stub.year, stub.month),
          lastEditedBy: session.teamMemberId,
        })
      )
    );

    const months = [...existing, ...created];
    months.sort((a, b) => (a.monthKey < b.monthKey ? 1 : -1));
    return NextResponse.json(months);
  } catch (error) {
    console.error("Failed to fetch SEO strategy months:", error);
    return NextResponse.json(
      { error: "Failed to fetch SEO strategy months" },
      { status: 500 }
    );
  }
}
