import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { PREFERENCE_DEFAULTS, getPreferenceDefaults } from "@/lib/notification-preferences";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const convex = getConvexClient();
    const doc = await convex.query(api.notificationPreferences.getByMember, {
      teamMemberId: session.teamMemberId as any,
    });

    // Build preferences object with role-aware defaults for missing values
    const defaults = getPreferenceDefaults(session.roleLevel);
    const prefs: Record<string, boolean> = {};
    for (const [key, defaultVal] of Object.entries(defaults)) {
      prefs[key] = doc ? ((doc as any)[key] ?? defaultVal) : defaultVal;
    }

    return NextResponse.json({ prefs });
  } catch (error) {
    console.error("Failed to fetch notification preferences:", error);
    return NextResponse.json(
      { error: "Failed to fetch preferences" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (!body.prefs || typeof body.prefs !== "object") {
    return NextResponse.json({ error: "prefs object required" }, { status: 400 });
  }

  // Only allow known preference keys (use full defaults set which includes all keys)
  const cleanPrefs: Record<string, boolean> = {};
  for (const key of Object.keys(getPreferenceDefaults("owner"))) {
    if (key in body.prefs && typeof body.prefs[key] === "boolean") {
      cleanPrefs[key] = body.prefs[key];
    }
  }

  try {
    const convex = getConvexClient();
    await convex.mutation(api.notificationPreferences.upsert, {
      teamMemberId: session.teamMemberId as any,
      prefs: cleanPrefs as any,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save notification preferences:", error);
    return NextResponse.json(
      { error: "Failed to save preferences" },
      { status: 500 }
    );
  }
}
