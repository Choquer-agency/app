import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { hasPermission, validateRoleLevel } from "@/lib/permissions";

function checkOwnerAccess(request: NextRequest): boolean {
  const session = getSession(request);
  if (!session) return false;
  const role = validateRoleLevel(session.roleLevel);
  return hasPermission(role, "nav:leads");
}

export async function GET(request: NextRequest) {
  if (!checkOwnerAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const convex = getConvexClient();
    const leads = await convex.query(api.leads.list, {});
    return NextResponse.json(leads);
  } catch (error) {
    console.error("Failed to fetch leads:", error);
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!checkOwnerAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (!body.company?.trim()) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }

    const convex = getConvexClient();
    const lead = await convex.mutation(api.leads.create, {
      company: body.company.trim(),
      contactName: body.contactName || undefined,
      contactRole: body.contactRole || undefined,
      contactEmail: body.contactEmail || undefined,
      website: body.website || undefined,
      status: body.status || undefined,
      notes: body.notes || undefined,
      source: body.source || undefined,
    });

    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    console.error("Failed to create lead:", error);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!checkOwnerAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "Lead ID is required" }, { status: 400 });
    }

    const convex = getConvexClient();
    const { id, ...fields } = body;
    const lead = await convex.mutation(api.leads.update, { id, ...fields });
    return NextResponse.json(lead);
  } catch (error) {
    console.error("Failed to update lead:", error);
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!checkOwnerAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Lead ID is required" }, { status: 400 });
    }

    const convex = getConvexClient();
    await convex.mutation(api.leads.remove, { id: id as any });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete lead:", error);
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 });
  }
}
