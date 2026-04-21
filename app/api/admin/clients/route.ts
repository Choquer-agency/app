import { NextRequest, NextResponse } from "next/server";
import { getAllClients, getPastClients, createClient } from "@/lib/clients";
import { CreateClientInput } from "@/types";
import { getSession } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { notifyClientAdded } from "@/lib/notification-triggers";

export async function GET(request: NextRequest) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const past = url.searchParams.get("past") === "true";
    const clients = past ? await getPastClients() : await getAllClients();
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
  const session = getSession(request);
  if (!session) {
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

    // Celebrate the new client: pinned bulletin + bell notifications to all team members.
    try {
      const convex = getConvexClient();
      const segments: string[] = [];
      if (body.mrr) segments.push(`$${body.mrr}/mo MRR`);
      if (body.accountSpecialist) segments.push(`AM: ${body.accountSpecialist}`);
      if (body.industry) segments.push(body.industry);
      const summary = segments.length
        ? segments.join(" • ")
        : "New signing — welcome them to the family.";

      const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

      await convex.mutation(api.bulletin.createAnnouncement, {
        authorId: session.teamMemberId as any,
        title: `Welcome ${client.name}!`,
        content: summary,
        pinned: true,
        source: "client_signing",
        announcementType: "celebration",
        expiresAt,
      });

      await notifyClientAdded(
        String(client.id),
        client.name,
        summary,
        session.teamMemberId
      );
    } catch (err) {
      console.error("[clients] Failed to announce new client:", err);
    }

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
