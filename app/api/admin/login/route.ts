import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { encodeCookie, COOKIE_NAME } from "@/lib/admin-auth";
import {
  getTeamMemberByEmailForAuth,
  updateLastLogin,
} from "@/lib/team-members";
import { validateRoleLevel } from "@/lib/permissions";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  // Look up team member by email
  const member = await getTeamMemberByEmailForAuth(email);

  if (!member) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  if (!member.active) {
    return NextResponse.json(
      { error: "Account deactivated" },
      { status: 401 }
    );
  }

  // Verify password: bcrypt hash if set, otherwise fall back to shared ADMIN_PASSWORD
  let passwordValid = false;

  if (member.password_hash) {
    passwordValid = await bcrypt.compare(password, member.password_hash);
  } else {
    passwordValid = password === ADMIN_PASSWORD;
  }

  if (!passwordValid) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  // Create session cookie with team member identity
  const roleLevel = validateRoleLevel(member.role_level);

  const cookieValue = encodeCookie({
    teamMemberId: member.id,
    name: member.name,
    email: member.email,
    roleLevel,
  });

  // Update last login timestamp (fire and forget)
  updateLastLogin(member.id).catch(() => {});

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return response;
}
