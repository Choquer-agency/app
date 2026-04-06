import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { createTicket, type Actor } from "@/lib/tickets";
import { createNotification } from "@/lib/notifications";
import { sendSlackDM } from "@/lib/slack";
import {
  sendPaymentSuspendedEmail,
  sendPaymentEscalationEmail,
  sendPaymentFailedEmail,
  sendCardExpiryWarningEmail,
} from "@/lib/payment-emails";
import type { ConvergeRecurringProfile } from "@/lib/converge";

const convex = getConvexClient();

// --- Helpers ---

async function getOwner(): Promise<{ _id: string; slackUserId?: string; email?: string; name: string } | null> {
  const members = await convex.query(api.teamMembers.list, {});
  return members.find((m: any) => m.roleLevel === "owner" && m.active) || null;
}

async function getClient(clientId: string) {
  return await convex.query(api.clients.getById, { id: clientId as any });
}

// --- Core: Process a Converge poll result ---

export async function processConvergePoll(
  profile: {
    _id: string;
    clientId: string;
    recurringId: string;
    lastStatus?: string | null;
    label?: string | null;
  },
  convergeData: ConvergeRecurringProfile
) {
  const previousStatus = profile.lastStatus;
  const currentStatus = convergeData.status;

  // Update profile with latest data from Converge
  await convex.mutation(api.convergeProfiles.update, {
    id: profile._id as any,
    lastPolledAt: new Date().toISOString(),
    lastStatus: currentStatus,
    cardLastFour: convergeData.cardLastFour ?? undefined,
    cardExpiryMonth: convergeData.cardExpiryMonth ?? undefined,
    cardExpiryYear: convergeData.cardExpiryYear ?? undefined,
    amount: convergeData.amount ?? undefined,
    billingCycle: convergeData.billingCycle ?? undefined,
    nextPaymentDate: convergeData.nextPaymentDate ?? undefined,
    paymentsMade: convergeData.paymentsMade ?? undefined,
  });

  // Detect status transitions
  if (previousStatus === "Active" && currentStatus === "Suspended") {
    // Payment failed and Converge gave up — escalate immediately
    await handleNewSuspension(profile, convergeData);
  } else if (
    (previousStatus === "Suspended") &&
    currentStatus === "Active"
  ) {
    // Client updated card, Converge reactivated — auto-resolve
    await handleAutoResolution(profile);
  }
  // Active → Active: no action
  // Suspended → Suspended: reminders handled by separate cron
}

// --- Handle new suspension (payment failure escalation) ---

async function handleNewSuspension(
  profile: { _id: string; clientId: string; recurringId: string; label?: string | null },
  convergeData: ConvergeRecurringProfile
) {
  const client = await getClient(profile.clientId);
  if (!client) return;

  const owner = await getOwner();

  // 1. Create payment issue record
  const issueId = await convex.mutation(api.paymentIssues.create, {
    clientId: profile.clientId as any,
    convergeProfileId: profile._id as any,
    convergeStatus: "Suspended",
    failureCount: 1,
  });

  // 2. Create urgent ticket assigned to CEO
  let ticketId: string | undefined;
  if (owner) {
    const ticket = await createTicket(
      {
        title: `PAYMENT FAILURE: ${client.name} — card declined, Converge suspended`,
        description: `<p>Converge has suspended the recurring payment for <strong>${client.name}</strong> after multiple failed attempts.</p>
<p><strong>Profile:</strong> ${profile.label || profile.recurringId}</p>
<p><strong>Amount:</strong> $${convergeData.amount ?? "Unknown"}/mo</p>
<p><strong>Action needed:</strong> Contact the client to update their credit card information before the end of the month.</p>`,
        descriptionFormat: "plain",
        clientId: profile.clientId,
        status: "needs_attention",
        priority: "urgent",
        assigneeIds: [owner._id],
      },
      owner._id,
      { id: owner._id, name: "System" }
    );
    ticketId = ticket.id;
  }

  // 3. Escalate the issue (link ticket)
  await convex.mutation(api.paymentIssues.escalate, {
    id: issueId as any,
    ticketId: ticketId ? (ticketId as any) : undefined,
  });

  // 4. Email the client
  if (client.contactEmail && client.contactName) {
    try {
      await sendPaymentSuspendedEmail({
        contactEmail: client.contactEmail,
        contactName: client.contactName,
      });
      await convex.mutation(api.paymentIssues.updateEmailTracking, {
        id: issueId as any,
      });
    } catch (err) {
      console.error("[payment-issues] Failed to send client email:", err);
    }
  }

  // 5. Email the CEO
  if (owner) {
    const ownerDoc = await convex.query(api.teamMembers.getById, { id: owner._id as any });
    if (ownerDoc?.email) {
      try {
        await sendPaymentEscalationEmail({
          ceoEmail: ownerDoc.email,
          clientName: client.name,
          mrr: client.mrr ?? null,
          amount: convergeData.amount,
          profileLabel: profile.label ?? undefined,
        });
      } catch (err) {
        console.error("[payment-issues] Failed to send CEO email:", err);
      }
    }

    // 6. Slack DM to CEO
    if (owner.slackUserId) {
      const amountStr = convergeData.amount ? `$${convergeData.amount}` : "Unknown amount";
      try {
        await sendSlackDM(
          owner.slackUserId,
          `🚨 *PAYMENT ALERT: ${client.name}*\nConverge suspended recurring payment (${amountStr}/mo). Urgent ticket created. Update their card ASAP.`
        );
      } catch (err) {
        console.error("[payment-issues] Failed to send Slack DM:", err);
      }
    }

    // 7. In-app notification
    try {
      await createNotification(
        owner._id,
        ticketId || null,
        "payment_suspended" as any,
        `Payment suspended: ${client.name}`,
        `Converge suspended recurring payment after multiple failed attempts. ${convergeData.amount ? `$${convergeData.amount}/mo at risk.` : ""}`,
        "/admin/crm"
      );
    } catch (err) {
      console.error("[payment-issues] Failed to create notification:", err);
    }
  }
}

// --- Handle auto-resolution (card updated, Converge reactivated) ---

async function handleAutoResolution(
  profile: { _id: string; clientId: string; recurringId: string }
) {
  // Find the open/escalated issue for this profile
  const issue = await convex.query(api.paymentIssues.getByConvergeProfile, {
    convergeProfileId: profile._id as any,
  });
  if (!issue) return;

  // Resolve the issue
  await convex.mutation(api.paymentIssues.resolve, {
    id: issue._id as any,
    resolutionNote: "Auto-resolved: Converge profile reactivated (card updated)",
  });

  // Close the linked ticket if it exists
  if (issue.ticketId) {
    try {
      await convex.mutation(api.tickets.update, {
        id: issue.ticketId as any,
        status: "closed",
      });
    } catch (err) {
      console.error("[payment-issues] Failed to close ticket:", err);
    }
  }

  // Notify owner
  const owner = await getOwner();
  const client = await getClient(profile.clientId);
  if (owner && client) {
    if (owner.slackUserId) {
      try {
        await sendSlackDM(
          owner.slackUserId,
          `✅ *Payment resolved: ${client.name}*\nConverge recurring profile is Active again. Card has been updated.`
        );
      } catch (err) {
        console.error("[payment-issues] Failed to send resolution Slack DM:", err);
      }
    }

    try {
      await createNotification(
        owner._id,
        issue.ticketId || null,
        "payment_resolved" as any,
        `Payment resolved: ${client.name}`,
        "Converge recurring profile reactivated — card updated successfully.",
        "/admin/crm"
      );
    } catch (err) {
      console.error("[payment-issues] Failed to create resolution notification:", err);
    }
  }
}

// --- Manual: Create a payment issue by hand (fallback) ---

export async function createManualPaymentIssue(clientId: string) {
  const client = await getClient(clientId);
  if (!client) throw new Error("Client not found");

  const issueId = await convex.mutation(api.paymentIssues.create, {
    clientId: clientId as any,
    failureCount: 1,
  });

  // Email the client
  if (client.contactEmail && client.contactName) {
    try {
      await sendPaymentFailedEmail({
        contactEmail: client.contactEmail,
        contactName: client.contactName,
        failureCount: 1,
      });
      await convex.mutation(api.paymentIssues.updateEmailTracking, {
        id: issueId as any,
      });
    } catch (err) {
      console.error("[payment-issues] Failed to send client email:", err);
    }
  }

  // Notify owner
  const owner = await getOwner();
  if (owner?.slackUserId) {
    try {
      await sendSlackDM(
        owner.slackUserId,
        `⚠️ Payment failure logged for *${client.name}*. Client has been notified.`
      );
    } catch (err) {
      console.error("[payment-issues] Failed to send Slack notification:", err);
    }
  }

  return issueId;
}

// --- Resolve an issue manually ---

export async function resolvePaymentIssue(
  issueId: string,
  resolvedBy?: string,
  note?: string
) {
  const issue = await convex.query(api.paymentIssues.getById, { id: issueId as any });
  if (!issue) throw new Error("Payment issue not found");

  await convex.mutation(api.paymentIssues.resolve, {
    id: issueId as any,
    resolvedBy: resolvedBy ? (resolvedBy as any) : undefined,
    resolutionNote: note,
  });

  // Close linked ticket
  if (issue.ticketId) {
    try {
      await convex.mutation(api.tickets.update, {
        id: issue.ticketId as any,
        status: "closed",
      });
    } catch (err) {
      console.error("[payment-issues] Failed to close linked ticket:", err);
    }
  }
}

// --- Get all unresolved issues with client data ---

export async function getOpenIssuesWithClients() {
  const issues = await convex.query(api.paymentIssues.listUnresolved, {});
  const enriched = await Promise.all(
    issues.map(async (issue: any) => {
      const client = await getClient(issue.clientId);
      let profile = null;
      if (issue.convergeProfileId) {
        profile = await convex.query(api.convergeProfiles.getById, {
          id: issue.convergeProfileId,
        });
      }
      return {
        ...issue,
        id: issue._id,
        clientName: client?.name ?? "Unknown",
        clientSlug: client?.slug,
        contactEmail: client?.contactEmail,
        contactName: client?.contactName,
        mrr: client?.mrr,
        profileLabel: profile?.label,
        profileAmount: profile?.amount,
      };
    })
  );
  return enriched;
}

// --- Check card expiry and send warnings ---

export async function checkCardExpiry(
  profile: {
    _id: string;
    clientId: string;
    cardExpiryMonth?: number | null;
    cardExpiryYear?: number | null;
    cardExpiryNotifiedAt?: string | null;
    label?: string | null;
  }
) {
  if (!profile.cardExpiryMonth || !profile.cardExpiryYear) return false;

  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear();

  // Calculate months until expiry
  const monthsUntilExpiry =
    (profile.cardExpiryYear - currentYear) * 12 +
    (profile.cardExpiryMonth - currentMonth);

  // Only warn if expiring within 2 months
  if (monthsUntilExpiry > 2 || monthsUntilExpiry < 0) return false;

  // Don't send if already notified in the last 30 days
  if (profile.cardExpiryNotifiedAt) {
    const lastNotified = new Date(profile.cardExpiryNotifiedAt);
    const daysSinceNotified = (now.getTime() - lastNotified.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceNotified < 30) return false;
  }

  const client = await getClient(profile.clientId);
  if (!client?.contactEmail || !client?.contactName) return false;

  // Send expiry warning
  try {
    await sendCardExpiryWarningEmail({
      contactEmail: client.contactEmail,
      contactName: client.contactName,
      expiryMonth: profile.cardExpiryMonth,
      expiryYear: profile.cardExpiryYear,
    });
  } catch (err) {
    console.error("[payment-issues] Failed to send expiry warning:", err);
    return false;
  }

  // Update notified timestamp
  await convex.mutation(api.convergeProfiles.update, {
    id: profile._id as any,
    cardExpiryNotifiedAt: now.toISOString(),
  });

  // Notify owner in-app
  const owner = await getOwner();
  if (owner) {
    try {
      await createNotification(
        owner._id,
        null,
        "card_expiring" as any,
        `Card expiring: ${client.name}`,
        `Card on file expires ${profile.cardExpiryMonth}/${profile.cardExpiryYear}. Client has been notified.`,
        "/admin/crm"
      );
    } catch (err) {
      console.error("[payment-issues] Failed to create expiry notification:", err);
    }
  }

  return true;
}
