import { NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

// Public endpoint: returns only active team member names + profile pics for login screen
export async function GET() {
  try {
    const convex = getConvexClient();
    const docs = await convex.query(api.teamMembers.list, { activeOnly: true });
    return NextResponse.json(
      docs.map((d: any) => ({
        id: d._id,
        name: d.name,
        email: d.email,
        profilePicUrl: d.profilePicUrl || "",
      }))
    );
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
