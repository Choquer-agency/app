import { NextRequest, NextResponse } from "next/server";
import { getAllClients, createClient } from "@/lib/clients";
import { CreateClientInput } from "@/types";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const COOKIE_NAME = "insightpulse_admin";

function isAuthed(request: NextRequest): boolean {
  return request.cookies.get(COOKIE_NAME)?.value === ADMIN_PASSWORD;
}

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const clients = await getAllClients();
    return NextResponse.json(clients);
  } catch (error) {
    console.error("Failed to fetch clients:", error);
    return NextResponse.json(
      { error: "Failed to fetch clients" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: CreateClientInput = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "Business name is required" },
        { status: 400 }
      );
    }

    const client = await createClient({
      name: body.name.trim(),
      notionPageUrl: body.notionPageUrl || "",
      ga4PropertyId: body.ga4PropertyId || "",
      gscSiteUrl: body.gscSiteUrl || "",
      calLink:
        body.calLink || "https://cal.com/andres-agudelo-hqlknm/15min",
      active: body.active ?? true,
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    console.error("Failed to create client:", error);
    const message =
      error instanceof Error && error.message.includes("unique")
        ? "A client with this name already exists"
        : "Failed to create client";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
