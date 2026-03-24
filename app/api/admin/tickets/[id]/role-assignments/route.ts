import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

// POST — add a role assignment to a ticket
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { templateRoleId } = await req.json();

  const convex = getConvexClient();
  await convex.mutation(api.ticketTemplateRoleAssignments.add, {
    ticketId: id as any,
    templateRoleId: templateRoleId as any,
  });

  return NextResponse.json({ ok: true });
}

// DELETE — remove a role assignment from a ticket
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { templateRoleId } = await req.json();

  const convex = getConvexClient();
  await convex.mutation(api.ticketTemplateRoleAssignments.remove, {
    ticketId: id as any,
    templateRoleId: templateRoleId as any,
  });

  return NextResponse.json({ ok: true });
}
