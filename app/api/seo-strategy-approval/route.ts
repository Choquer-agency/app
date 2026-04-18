import { NextRequest, NextResponse } from "next/server";
import {
  getMonthBySlug,
  saveMonth,
  setClientApproval,
  classifyStatus,
  parseMonthKey,
  EMPTY_TIPTAP_DOC,
} from "@/lib/seo-strategy-months";
import { getClientBySlug } from "@/lib/clients";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const slug = typeof body?.slug === "string" ? body.slug : "";
    const monthKey = typeof body?.monthKey === "string" ? body.monthKey : "";
    const approved = !!body?.approved;

    if (!slug || !monthKey) {
      return NextResponse.json({ error: "Missing slug or monthKey" }, { status: 400 });
    }

    let month = await getMonthBySlug(slug, monthKey);
    if (!month) {
      const client = await getClientBySlug(slug);
      if (!client) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 });
      }
      const { year, month: m } = parseMonthKey(monthKey);
      month = await saveMonth({
        clientId: client.id,
        clientSlug: client.slug,
        monthKey,
        rawContent: EMPTY_TIPTAP_DOC,
        status: classifyStatus(year, m),
      });
    }

    await setClientApproval(month.id, approved);
    const updated = await getMonthBySlug(slug, monthKey);
    return NextResponse.json({
      approved: !!updated?.clientApprovedAt,
      clientApprovedAt: updated?.clientApprovedAt ?? null,
    });
  } catch (error) {
    console.error("Client-side strategy approval failed:", error);
    return NextResponse.json(
      { error: "Failed to update approval" },
      { status: 500 }
    );
  }
}
