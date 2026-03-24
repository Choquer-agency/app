import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/admin-auth";
import { setPasswordHash } from "@/lib/team-members";
import { hasPermission } from "@/lib/permissions";

/**
 * Owner-only: set or reset a team member's password.
 * PUT { password }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!hasPermission(session.roleLevel, "team:manage_passwords")) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const teamMemberId = id;
      { status: 400 }
    );
  }

  const { password } = await request.json();
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const hash = await bcrypt.hash(password, 12);
  const updated = await setPasswordHash(teamMemberId, hash);

  if (!updated) {
    return NextResponse.json(
      { error: "Team member not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
