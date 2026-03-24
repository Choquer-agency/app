import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getSavedViews, createSavedView } from "@/lib/saved-views";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const views = await getSavedViews(session.teamMemberId);
    return NextResponse.json(views);
  } catch (error) {
    console.error("Failed to fetch saved views:", error);
    return NextResponse.json({ error: "Failed to fetch saved views" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!body.filters || typeof body.filters !== "object") {
      return NextResponse.json({ error: "Filters object is required" }, { status: 400 });
    }

    const view = await createSavedView(session.teamMemberId, {
      name: body.name.trim(),
      filters: body.filters,
      isDefault: body.isDefault,
    });

    return NextResponse.json(view, { status: 201 });
  } catch (error) {
    console.error("Failed to create saved view:", error);
    return NextResponse.json({ error: "Failed to create saved view" }, { status: 500 });
  }
}
