import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { getRecurringProfile, getTransactions, type ConvergeCurrency } from "@/lib/converge";
import { processConvergePoll, checkCardExpiry } from "@/lib/payment-issues";
import { sendSlackDM } from "@/lib/slack";

const convex = getConvexClient();
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.choquer.agency";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const isDev = process.env.NODE_ENV === "development";

  if (!isDev && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = {
    profilesPolled: 0,
    newSuspensions: 0,
    autoResolutions: 0,
    expiryWarnings: 0,
    errors: 0,
  };

  try {
    // Fetch all active Converge profiles and team members
    const profiles = await convex.query(api.convergeProfiles.list, { activeOnly: true });
    const allMembers = await convex.query(api.teamMembers.list, {});

    for (const profile of profiles) {
      try {
        // Poll Converge for current status
        const currency = (profile.currency || "USD") as ConvergeCurrency;
        const convergeData = await getRecurringProfile(profile.recurringId, currency);
        results.profilesPolled++;

        // Detect status changes and act
        const previousStatus = profile.lastStatus;
        await processConvergePoll(
          {
            _id: profile._id,
            clientId: profile.clientId,
            recurringId: profile.recurringId,
            lastStatus: profile.lastStatus,
            label: profile.label,
          },
          convergeData
        );

        // Track transitions for summary
        if (previousStatus === "Active" && convergeData.status === "Suspended") {
          results.newSuspensions++;
        } else if (previousStatus === "Suspended" && convergeData.status === "Active") {
          results.autoResolutions++;
        }

        // Check card expiry (uses the freshly updated profile data)
        const warned = await checkCardExpiry({
          _id: profile._id,
          clientId: profile.clientId,
          cardExpiryMonth: convergeData.cardExpiryMonth,
          cardExpiryYear: convergeData.cardExpiryYear,
          cardExpiryNotifiedAt: profile.cardExpiryNotifiedAt,
          label: profile.label,
        });
        if (warned) results.expiryWarnings++;

        // Small delay between API calls to avoid hammering Converge
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`[converge-poll] Error polling profile ${profile.recurringId}:`, err);
        results.errors++;
      }
    }

    // Sync today's transactions to Convex for instant page loads
    let txnsSynced = 0;
    let unknownAlerts = 0;
    try {
      const today = new Date();
      const startOfMonth = `${String(today.getMonth() + 1).padStart(2, "0")}/01/${today.getFullYear()}`;
      const fresh = await getTransactions(startOfMonth);

      // Build lookups: recurring ID -> client name AND card -> client name
      const clientIds = [...new Set(profiles.map((p: any) => p.clientId))];
      const clientMap = new Map<string, string>();
      for (const cid of clientIds) {
        const client = await convex.query(api.clients.getById, { id: cid as any });
        if (client) clientMap.set(cid as string, client.name);
      }

      const byRecurringId = new Map<string, string>();
      const byCard = new Map<string, string>();
      for (const p of profiles) {
        const name = clientMap.get(p.clientId as string);
        if (!name) continue;
        byRecurringId.set(p.recurringId, name);
        if (p.cardLastFour && p.cardExpiryMonth && p.cardExpiryYear) {
          const cardKey = `${p.cardLastFour}-${String(p.cardExpiryMonth).padStart(2, "0")}${String(p.cardExpiryYear).slice(-2)}`;
          byCard.set(cardKey, name);
        }
      }

      // Enrich transactions with client names (recurring ID match, then card match)
      const enriched = fresh.map((t) => {
        let clientName: string | undefined;
        if (t.recurringId && byRecurringId.has(t.recurringId)) {
          clientName = byRecurringId.get(t.recurringId);
        } else if (t.cardLastFour && t.cardExpiryMonth && t.cardExpiryYear) {
          const cardKey = `${t.cardLastFour}-${String(t.cardExpiryMonth).padStart(2, "0")}${String(t.cardExpiryYear).slice(-2)}`;
          clientName = byCard.get(cardKey);
        }
        return {
          ...t,
          firstName: t.firstName || undefined,
          lastName: t.lastName || undefined,
          company: t.company || undefined,
          description: t.description || undefined,
          cardType: t.cardType || undefined,
          cardLastFour: t.cardLastFour || undefined,
          cardExpiryMonth: t.cardExpiryMonth || undefined,
          cardExpiryYear: t.cardExpiryYear || undefined,
          recurringId: t.recurringId || undefined,
          txnTime: t.txnTime || undefined,
          settleTime: t.settleTime || undefined,
          approvalCode: t.approvalCode || undefined,
          clientName,
        };
      });

      // Store in Convex
      const newTxnIds: string[] = [];
      for (let i = 0; i < enriched.length; i += 50) {
        const batch = await convex.mutation(api.convergeTransactions.upsertBatch, {
          transactions: enriched.slice(i, i + 50),
        });
        txnsSynced += batch.inserted;
      }

      // Slack DM for NEW unknown transactions (no client match)
      // Only alert for transactions inserted today (new ones)
      if (txnsSynced > 0) {
        const owner = allMembers.find((m: any) => m.roleLevel === "owner" && m.active && m.slackUserId);
        if (owner) {
          const unknowns = enriched.filter((t) => !t.clientName && t.status === "approved");
          // Check which are truly new (not already in DB before this sync)
          // We alert on all unmatched approved transactions from today
          const todayStr = today.toLocaleDateString("en-US");
          const todayUnknowns = unknowns.filter((t) => {
            if (!t.txnTime) return false;
            const txnDate = new Date(t.txnTime).toLocaleDateString("en-US");
            return txnDate === todayStr;
          });

          for (const t of todayUnknowns) {
            const name = [t.firstName, t.lastName].filter(Boolean).join(" ") || "Unknown";
            const desc = t.description || "No description";
            const amt = `$${t.amount}`;
            try {
              await sendSlackDM(
                owner.slackUserId as string,
                `💳 *New unlinked transaction*\n*${amt} ${t.terminal}* — ${desc}\nCardholder: ${name}\n\nThis transaction isn't linked to any client. <${APP_URL}/admin/payments|Link it in Payments>`
              );
              unknownAlerts++;
            } catch (err) {
              console.error("[converge-poll] Failed to send unknown txn alert:", err);
            }
          }
        }
      }
    } catch (err) {
      console.error("[converge-poll] Transaction sync error:", err);
    }

    console.log("[converge-poll] Complete:", { ...results, txnsSynced, unknownAlerts });
    return NextResponse.json({ ...results, txnsSynced, unknownAlerts });
  } catch (error) {
    console.error("[converge-poll] Fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron failed" },
      { status: 500 }
    );
  }
}
