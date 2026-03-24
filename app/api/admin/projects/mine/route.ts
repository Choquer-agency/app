import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getMyProjects } from "@/lib/projects";
import { hasMinRole } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const projects = await getMyProjects(
      session.teamMemberId,
      hasMinRole(session.roleLevel, "bookkeeper")
    );
    return NextResponse.json(projects);
  } catch (error) {
    console.error("Failed to fetch my projects:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}
