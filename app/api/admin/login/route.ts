import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { encodeCookie, COOKIE_NAME } from "@/lib/admin-auth";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Use email prefix as display name; team_members lookup is optional
    let memberName = email.split("@")[0];
    try {
      const { getTeamMemberByEmail } = await import("@/lib/team-members");
      const member = await getTeamMemberByEmail(email);
      if (member) {
        memberName = member.name;
      }
    } catch {
      // team_members table may not exist yet — proceed with email-based name
    }

    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, encodeCookie({ name: memberName, email }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Login failed" },
      { status: 500 }
    );
  }
}
