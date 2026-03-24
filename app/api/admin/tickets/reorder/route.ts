import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { reorderTickets } from "@/lib/tickets";

export async function PUT(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items array is required" }, { status: 400 });
    }

    const updated = await reorderTickets(
      items.map((item: { id: number; sortOrder: number }) => ({
        id: item.id,
        sortOrder: item.sortOrder,
      }))
    );

    return NextResponse.json({ updated });
  } catch (error) {
    console.error("Failed to reorder tickets:", error);
    return NextResponse.json({ error: "Failed to reorder tickets" }, { status: 500 });
  }
}
