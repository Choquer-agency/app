/**
 * Quote selection handler — migrated from the original route.ts.
 * Handles both numeric text replies and emoji reactions for selecting weekly quotes.
 */

import { sql } from "@vercel/postgres";
import { IntentHandler, HandlerContext, QuoteSelectionData } from "../types";
import { sendSlackDM } from "@/lib/slack";

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
  owner: { id: number; slackUserId: string }
): Promise<void> {
  const { rows: quotes } = await sql`
    SELECT id, week_start FROM weekly_quotes
    WHERE week_start = (SELECT MAX(week_start) FROM weekly_quotes)
    ORDER BY id ASC
  `;

  if (quoteNumber < 1 || quoteNumber > quotes.length) return;

  const selectedQuote = quotes[quoteNumber - 1];
  if (!selectedQuote) return;

  await sql`UPDATE weekly_quotes SET selected = false WHERE week_start = ${selectedQuote.week_start}`;
  await sql`UPDATE weekly_quotes SET selected = true WHERE id = ${selectedQuote.id}`;

  try {
    await sendSlackDM(owner.slackUserId, `Quote #${quoteNumber} selected for this week's bulletin!`);
  } catch {
    // Non-critical
  }
}
