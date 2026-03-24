import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getProjects, createProject } from "@/lib/projects";

export async function GET(request: NextRequest) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");
    const isTemplate = url.searchParams.get("isTemplate");
    const archived = url.searchParams.get("archived") === "true";
    const search = url.searchParams.get("search");

    const projects = await getProjects({
      clientId: clientId ? Number(clientId) : undefined,
      isTemplate: isTemplate === "true" ? true : isTemplate === "false" ? false : undefined,
      archived,
      search: search || undefined,
    });

    return NextResponse.json(projects);
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const project = await createProject(
      {
        name: body.name.trim(),
        description: body.description,
        clientId: body.clientId,
        isTemplate: body.isTemplate,
        status: body.status,
        startDate: body.startDate,
        dueDate: body.dueDate,
      },
      session.teamMemberId
    );

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
