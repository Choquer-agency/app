import { NextRequest, NextResponse } from "next/server";
import { getProjectDependencies } from "@/lib/projects";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);
  const deps = await getProjectDependencies(projectId);
  return NextResponse.json(deps);
}
