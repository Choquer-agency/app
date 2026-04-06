import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { sendPaymentReminderEmail } from "@/lib/payment-emails";

const convex = getConvexClient();

// Reminder cadence: days after escalation for each email
const REMINDER_SCHEDULE = [0, 3, 7, 14, 21]; // first 5 emails
const MONTHLY_INTERVAL = 30; // after that, every 30 days

function shouldSendReminder(
  escalatedAt: string,
  lastClientEmailAt: string | null | undefined,
  emailCount: number
): boolean {
  const now = new Date();
  const escalationDate = new Date(escalatedAt);
  const daysSinceEscalation = Math.floor(
    (now.getTime() - escalationDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Determine the target day for the next email
  let targetDay: number;
  if (emailCount < REMINDER_SCHEDULE.length) {
    targetDay = REMINDER_SCHEDULE[emailCount];
  } else {
    // Monthly after the schedule is exhausted
    const extraEmails = emailCount - REMINDER_SCHEDULE.length;
    targetDay = REMINDER_SCHEDULE[REMINDER_SCHEDULE.length - 1] + MONTHLY_INTERVAL * (extraEmails + 1);
  }

  if (daysSinceEscalation < targetDay) return false;

  // Don't send if we already sent today
  if (lastClientEmailAt) {
    const lastSent = new Date(lastClientEmailAt);
    const hoursSinceLastEmail = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastEmail < 20) return false; // safety buffer
  }

  return true;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const isDev = process.env.NODE_ENV === "development";

  if (!isDev && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = { checked: 0, reminded: 0, errors: 0 };

  try {
    // Get all escalated issues (open issues don't get auto-reminders)
    const issues = await convex.query(api.paymentIssues.list, { status: "escalated" });

    for (const issue of issues) {
      results.checked++;

      if (!issue.escalatedAt) continue;

      const shouldSend = shouldSendReminder(
        issue.escalatedAt,
        issue.lastClientEmailAt,
        issue.emailCount ?? 0
      );

      if (!shouldSend) continue;

      try {
        // Get client info for the email
        const client = await convex.query(api.clients.getById, { id: issue.clientId });
        if (!client?.contactEmail || !client?.contactName) continue;

        const daysSinceFailure = Math.floor(
          (Date.now() - new Date(issue.firstFailedAt).getTime()) / (1000 * 60 * 60 * 24)
        );

        await sendPaymentReminderEmail({
          contactEmail: client.contactEmail,
          contactName: client.contactName,
          daysSinceFailure,
        });

        await convex.mutation(api.paymentIssues.updateEmailTracking, {
          id: issue._id,
        });

        results.reminded++;
      } catch (err) {
        console.error(`[payment-reminders] Error sending reminder for issue ${issue._id}:`, err);
        results.errors++;
      }
    }

    console.log("[payment-reminders] Complete:", results);
    return NextResponse.json(results);
  } catch (error) {
    console.error("[payment-reminders] Fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron failed" },
      { status: 500 }
    );
  }
}
