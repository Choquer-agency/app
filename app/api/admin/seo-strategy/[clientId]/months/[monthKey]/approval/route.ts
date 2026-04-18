import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import {
  getMonth,
  saveMonth,
  setClientApproval,
  classifyStatus,
  parseMonthKey,
  EMPTY_TIPTAP_DOC,
} from "@/lib/seo-strategy-months";
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
    const approved = !!body?.approved;

    let month = await getMonth(clientId, monthKey);
    if (!month) {
      const client = await getClientById(clientId);
      if (!client) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 });
      }
      const { year, month: m } = parseMonthKey(monthKey);
      month = await saveMonth({
        clientId,
        clientSlug: client.slug,
        monthKey,
        rawContent: EMPTY_TIPTAP_DOC,
        status: classifyStatus(year, m),
        lastEditedBy: session.teamMemberId,
      });
    }

    await setClientApproval(month.id, approved, session.teamMemberId);
    const updated = await getMonth(clientId, monthKey);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to set client approval:", error);
    return NextResponse.json(
      { error: "Failed to set client approval" },
      { status: 500 }
    );
  }
}
