/**
 * Quote selection handler — migrated from the original route.ts.
 * Handles both numeric text replies and emoji reactions for selecting weekly quotes.
 */

import { getConvexClient } from "../../convex-server";
import { api } from "@/convex/_generated/api";
import { IntentHandler, HandlerContext, QuoteSelectionData } from "../types";
import { sendSlackDM } from "@/lib/slack";

function getWeekStart(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  return monday.toISOString().split("T")[0];
}

export class QuoteSelectionHandler implements IntentHandler {
  async handle(ctx: HandlerContext): Promise<void> {
    const { owner, classification } = ctx;
    const data = classification?.data as QuoteSelectionData | undefined;
    const quoteNumber = data?.number;
    if (!quoteNumber) return;

    await handleQuoteSelection(quoteNumber, owner);
  }
}

export async function handleQuoteSelection(
  quoteNumber: number,
  owner: { id: number | string; slackUserId: string }
): Promise<void> {
  const convex = getConvexClient();
  const weekStart = getWeekStart();
  const quotes = await convex.query(api.bulletin.listQuotesForWeek, { weekStart }) as any[];

  if (quoteNumber < 1 || quoteNumber > quotes.length) return;

  const selectedQuote = quotes[quoteNumber - 1];
  if (!selectedQuote) return;

  await convex.mutation(api.bulletin.selectQuote, {
    id: selectedQuote._id as any,
  });

  try {
    await sendSlackDM(owner.slackUserId, `Quote #${quoteNumber} selected for this week's bulletin!`);
  } catch {
    // Non-critical
  }
}
