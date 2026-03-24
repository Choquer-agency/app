import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getServiceBoardEntries } from "@/lib/service-board";
import { ServiceBoardCategory } from "@/types";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const category = url.searchParams.get("category") as ServiceBoardCategory;
    const month = url.searchParams.get("month");

    if (!category || !month) {
      return NextResponse.json(
        { error: "category and month are required" },
        { status: 400 }
      );
    }

    if (!["seo", "google_ads", "retainer"].includes(category)) {
      return NextResponse.json(
        { error: "Invalid category" },
        { status: 400 }
      );
    }

    const entries = await getServiceBoardEntries(category, month);
    return NextResponse.json(entries);
  } catch (error) {
    console.error("Service board GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch service board" },
      { status: 500 }
    );
  }
}
