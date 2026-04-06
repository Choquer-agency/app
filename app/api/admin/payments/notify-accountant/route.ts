import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { sendNewClientAccountantEmail } from "@/lib/payment-emails";

const convex = getConvexClient();

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const {
      clientName,
      contactName,
      contactEmail,
      packageName,
      amount,
      currency,
      billingFrequency,
      country,
    } = body;

    // Get bookkeeper email from timesheet settings
    const settings = await convex.query(api.timesheetSettings.get, {});
    const bookkeeperEmail = settings?.bookkeeperEmail;

    if (!bookkeeperEmail) {
      return NextResponse.json(
        { error: "No bookkeeper email configured in Settings > Timesheet" },
        { status: 400 }
      );
    }

    await sendNewClientAccountantEmail({
      accountantEmail: bookkeeperEmail,
      clientName,
      contactName,
      contactEmail,
      packageName,
      amount,
      currency,
      billingFrequency,
      country,
      addedBy: session.name,
    });

    return NextResponse.json({ success: true, sentTo: bookkeeperEmail });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to notify accountant" },
      { status: 500 }
    );
  }
}
