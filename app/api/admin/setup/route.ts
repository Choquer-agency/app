import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  getTeamMemberByEmailForAuth,
  setPasswordAndRole,
  hasAdminWithPassword,
} from "@/lib/team-members";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

/**
 * One-time bootstrap endpoint: sets the first admin's password.
 * Self-destructs once any admin with a password exists.
 *
 * POST { email, password, setupKey }
 * - setupKey must match ADMIN_PASSWORD (proves you have env access)
 * - email must match an existing team member
 * - Fails if an admin with a password already exists
 */
export async function POST(request: NextRequest) {
  const { email, password, setupKey } = await request.json();

  if (!email || !password || !setupKey) {
    return NextResponse.json(
      { error: "email, password, and setupKey are required" },
      { status: 400 }
    );
  }

  // Verify setup key matches ADMIN_PASSWORD (proves env access)
  if (setupKey !== ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "Invalid setup key" },
      { status: 403 }
    );
  }

  // Self-destruct: reject if an admin with a password already exists
  const adminExists = await hasAdminWithPassword();
  if (adminExists) {
    return NextResponse.json(
      { error: "Setup already completed. An admin account already exists." },
      { status: 409 }
    );
  }

  // Validate password length
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  // Look up team member
  const member = await getTeamMemberByEmailForAuth(email);
  if (!member) {
    return NextResponse.json(
      { error: "No team member found with that email" },
      { status: 404 }
    );
  }

  // Hash password and set as admin
  const hash = await bcrypt.hash(password, 12);
  await setPasswordAndRole(member.id, hash, "admin");

  return NextResponse.json({
    ok: true,
    message: `Admin account set up for ${member.name} (${member.email})`,
  });
}
