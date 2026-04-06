import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { getRecurringProfile, type ConvergeCurrency } from "@/lib/converge";

const convex = getConvexClient();

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const profiles = await convex.query(api.convergeProfiles.list, {});

    // Enrich with client names
    const enriched = await Promise.all(
      profiles.map(async (p: any) => {
        const client = await convex.query(api.clients.getById, { id: p.clientId });
        return { ...p, id: p._id, clientName: client?.name ?? "Unknown" };
      })
    );

    return NextResponse.json(enriched);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch profiles" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.roleLevel, "nav:clients")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { clientId, recurringId, label, currency } = body;

    if (!clientId || !recurringId) {
      return NextResponse.json({ error: "clientId and recurringId are required" }, { status: 400 });
    }

    // Create the profile
    const profileId = await convex.mutation(api.convergeProfiles.create, {
      clientId,
      recurringId,
      label,
      currency: currency || "USD",
    });

    // Immediately poll Converge to validate and pull initial data
    try {
      const data = await getRecurringProfile(recurringId, (currency || "USD") as ConvergeCurrency);
      await convex.mutation(api.convergeProfiles.update, {
        id: profileId,
        lastPolledAt: new Date().toISOString(),
        lastStatus: data.status,
        cardLastFour: data.cardLastFour ?? undefined,
        cardExpiryMonth: data.cardExpiryMonth ?? undefined,
        cardExpiryYear: data.cardExpiryYear ?? undefined,
        amount: data.amount ?? undefined,
        billingCycle: data.billingCycle ?? undefined,
        nextPaymentDate: data.nextPaymentDate ?? undefined,
        paymentsMade: data.paymentsMade ?? undefined,
      });
    } catch (err) {
      console.error("[converge-profiles] Initial poll failed (profile saved anyway):", err);
    }

    return NextResponse.json({ id: profileId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create profile" },
      { status: 500 }
    );
  }
}
