import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getBreaksForEntry } from "@/lib/timesheet";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entryId = new URL(request.url).searchParams.get("entryId");
  if (!entryId) {
    return NextResponse.json({ error: "entryId required" }, { status: 400 });
  }

  const breaks = await getBreaksForEntry(entryId);
  return NextResponse.json(breaks);
}
