import { NextRequest, NextResponse } from "next/server";
import { getAllClients, createClient } from "@/lib/clients";
import { CreateClientInput } from "@/types";
import { getSession } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  if (!getSession(request)) {
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
  if (!getSession(request)) {
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
      seRankingsProjectId: body.seRankingsProjectId || "",
      calLink:
        body.calLink || "https://cal.com/andres-agudelo-hqlknm/15min",
      active: body.active ?? true,
      // CRM fields
      websiteUrl: body.websiteUrl,
      contactName: body.contactName,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
      contractStartDate: body.contractStartDate,
      contractEndDate: body.contractEndDate,
      mrr: body.mrr,
      country: body.country,
      accountSpecialist: body.accountSpecialist,
      seoHoursAllocated: body.seoHoursAllocated,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2,
      city: body.city,
      provinceState: body.provinceState,
      postalCode: body.postalCode,
      clientStatus: body.clientStatus,
      offboardingDate: body.offboardingDate,
      industry: body.industry,
      tags: body.tags,
      lastContactDate: body.lastContactDate,
      nextReviewDate: body.nextReviewDate,
      socialLinkedin: body.socialLinkedin,
      socialFacebook: body.socialFacebook,
      socialInstagram: body.socialInstagram,
      socialX: body.socialX,
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
