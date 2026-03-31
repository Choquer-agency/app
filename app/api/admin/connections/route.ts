import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getOrgConnections, getClientConnections, createApiKeyConnection, disconnectConnection } from "@/lib/connections";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.roleLevel, "connections:view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");

  try {
    const connections = clientId
      ? await getClientConnections(clientId)
      : await getOrgConnections();
    return NextResponse.json(connections);
  } catch (error) {
    console.error("Connections fetch error:", error);
    return NextResponse.json({ error: "Failed to load connections" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.roleLevel, "connections:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { platform, scope, clientId, apiKey, displayName } = body;

    if (!platform || !scope || !apiKey) {
      return NextResponse.json({ error: "platform, scope, and apiKey are required" }, { status: 400 });
    }

    const connection = await createApiKeyConnection({
      platform,
      scope,
      clientId: clientId || undefined,
      apiKey,
      displayName: displayName || undefined,
      addedById: session.teamMemberId,
    });

    return NextResponse.json(connection, { status: 201 });
  } catch (error) {
    console.error("Connection create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create connection" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.roleLevel, "connections:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    await disconnectConnection(id, session.teamMemberId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Connection delete error:", error);
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}
