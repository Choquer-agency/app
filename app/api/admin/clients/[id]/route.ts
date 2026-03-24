import { NextRequest, NextResponse } from "next/server";
import { getClientById, updateClient, hardDeleteClient } from "@/lib/clients";
import { syncClientMrr } from "@/lib/client-packages";
import { getSession } from "@/lib/admin-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    // Sync MRR from packages before returning
    await syncClientMrr(id).catch(() => {});
    const client = await getClientById(id);

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json(client);
  } catch (error) {
    console.error("Failed to fetch client:", error);
    return NextResponse.json({ error: "Failed to fetch client" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    // Auto-set active=false when status changes to inactive
    if (body.clientStatus === "inactive") {
      body.active = false;
    }
    // If coming back from inactive, re-activate
    if (body.clientStatus && body.clientStatus !== "inactive" && body.active === undefined) {
      body.active = true;
    }

    let client;

    try {
      client = await updateClient(id, body);
    } catch (dbError) {
      // If columns are missing, run migrations and retry
      if (dbError instanceof Error && dbError.message.includes("column")) {
        const { runCrmMigration } = await import("@/lib/migrate");
        await runCrmMigration();
        client = await updateClient(id, body);
      } else {
        throw dbError;
      }
    }

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json(client);
  } catch (error) {
    console.error("Failed to update client:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update client" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const success = await hardDeleteClient(id);

    if (!success) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete client:", error);
    return NextResponse.json(
      { error: "Failed to delete client" },
      { status: 500 }
    );
  }
}
