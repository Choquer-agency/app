import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { encodeCookie, COOKIE_NAME } from "@/lib/admin-auth";
import { getTeamMemberByEmail } from "@/lib/team-members";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  let memberName = email.split("@")[0];
  try {
    const member = await getTeamMemberByEmail(email);
    if (member) {
      memberName = member.name;
    }
  } catch {
    // team_members table may not exist yet — allow login with password only
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
}
