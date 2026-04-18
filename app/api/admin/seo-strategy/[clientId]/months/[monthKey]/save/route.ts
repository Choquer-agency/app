import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { saveMonth, parseMonthKey, classifyStatus } from "@/lib/seo-strategy-months";
import { getClientById } from "@/lib/clients";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; monthKey: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { clientId, monthKey } = await params;
    const body = await request.json();

    if (typeof body.rawContent !== "string") {
      return NextResponse.json({ error: "rawContent is required" }, { status: 400 });
    }

    const client = await getClientById(clientId);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const { year, month } = parseMonthKey(monthKey);
    const status = body.status ?? classifyStatus(year, month);

    const saved = await saveMonth({
      clientId,
      clientSlug: client.slug,
      monthKey,
      rawContent: body.rawContent,
      status,
      lastEditedBy: session.teamMemberId,
    });

    return NextResponse.json(saved);
  } catch (error) {
    console.error("Failed to save SEO strategy month:", error);
    return NextResponse.json(
      { error: "Failed to save SEO strategy month" },
      { status: 500 }
    );
  }
}
