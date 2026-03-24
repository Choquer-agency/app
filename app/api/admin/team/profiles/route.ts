import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

// Public endpoint: returns only active team member names + profile pics for login screen
export async function GET() {
  try {
    const { rows } = await sql`
      SELECT id, name, email, profile_pic_url
      FROM team_members
      WHERE active = true
      ORDER BY (LOWER(email) = 'bryce@choquer.agency') DESC, created_at ASC
    `;
    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        profilePicUrl: r.profile_pic_url || "",
      }))
    );
  } catch (err) {
    console.error("profiles error:", err);
    return NextResponse.json([], { status: 200 });
  }
}
