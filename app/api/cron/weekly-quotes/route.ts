import { NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { sendSlackDM, logSlackMessage } from "@/lib/slack";

/**
 * Weekly Quotes Cron — runs every Friday at 9 AM.
 * Generates 10 quotes (mix of funny and motivational) and sends them
 * to the owner via Slack DM. Owner reacts with a number emoji (1-10)
 * or replies with a number to select the quote for the upcoming week.
 */

// Curated quote pool — rotates through these, never repeating within 3 months
const QUOTE_POOL = [
  // Motivational
  { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { quote: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { quote: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { quote: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { quote: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { quote: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { quote: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { quote: "Your limitation — it's only your imagination.", author: "" },
  { quote: "Push yourself, because no one else is going to do it for you.", author: "" },
  { quote: "Great things never come from comfort zones.", author: "" },
  { quote: "Dream it. Wish it. Do it.", author: "" },
  { quote: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { quote: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { quote: "Quality is not an act, it is a habit.", author: "Aristotle" },
  { quote: "Stay hungry, stay foolish.", author: "Steve Jobs" },
  { quote: "What you do today can improve all your tomorrows.", author: "Ralph Marston" },
  { quote: "Strive not to be a success, but rather to be of value.", author: "Albert Einstein" },
  { quote: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { quote: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { quote: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
  // Funny / Light
  { quote: "I choose a lazy person to do a hard job, because they'll find an easy way to do it.", author: "Bill Gates" },
  { quote: "The elevator to success is out of order. You'll have to use the stairs, one step at a time.", author: "Joe Girard" },
  { quote: "People say nothing is impossible, but I do nothing every day.", author: "A.A. Milne" },
  { quote: "I'm not superstitious, but I am a little stitious.", author: "Michael Scott" },
  { quote: "The road to success is dotted with many tempting parking spots.", author: "Will Rogers" },
  { quote: "Opportunity does not knock, it presents itself when you beat down the door.", author: "Kyle Chandler" },
  { quote: "I didn't fail the test. I just found 100 ways to do it wrong.", author: "Benjamin Franklin" },
  { quote: "If you think you are too small to make a difference, try sleeping with a mosquito.", author: "Dalai Lama" },
  { quote: "The best things in life are free. The second best are very expensive.", author: "Coco Chanel" },
  { quote: "Be yourself; everyone else is already taken.", author: "Oscar Wilde" },
  { quote: "Life is short. Smile while you still have teeth.", author: "" },
  { quote: "The only place success comes before work is in the dictionary.", author: "Vidal Sassoon" },
  { quote: "I am so clever that sometimes I don't understand a single word of what I am saying.", author: "Oscar Wilde" },
  { quote: "Work until your bank account looks like a phone number.", author: "" },
  { quote: "Coffee: because adulting is hard.", author: "" },
  { quote: "Teamwork makes the dream work, but a vision becomes a nightmare when the leader has a big dream and a bad team.", author: "John C. Maxwell" },
  { quote: "Behind every successful person, there's a lot of coffee.", author: "" },
  { quote: "A diamond is a chunk of coal that did well under pressure.", author: "Henry Kissinger" },
  { quote: "The best way to appreciate your job is to imagine yourself without one.", author: "Oscar Wilde" },
  { quote: "If at first you don't succeed, redefine success.", author: "" },
];

function getNextMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 1 : 8 - day; // days until next Monday
  const nextMon = new Date(now);
  nextMon.setDate(now.getDate() + diff);
  return nextMon.toISOString().split("T")[0];
}

export async function GET() {
  try {
    const convex = getConvexClient();
    const weekStart = getNextMonday();

    // Check if quotes already generated for this week
    const existingQuote = await convex.query(api.bulletin.getQuoteForWeek, {
      weekStart,
    });
    if (existingQuote) {
      return NextResponse.json({ success: true, reason: "Quotes already generated for this week" });
    }

    // Get recently used quotes (last 12 weeks) to avoid repeats
    // We'll use getQuoteForWeek for recent weeks
    const recentQuotes = new Set<string>();
    const now = new Date();
    for (let i = 1; i <= 12; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      // Find the Monday of that week
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      const ws = d.toISOString().split("T")[0];
      const q = await convex.query(api.bulletin.getQuoteForWeek, { weekStart: ws });
      if (q && (q as any).quote) {
        recentQuotes.add((q as any).quote);
      }
    }

    // Filter available quotes
    const available = QUOTE_POOL.filter((q) => !recentQuotes.has(q.quote));

    // Pick 10 random quotes (mix of motivational and funny)
    const selected: typeof QUOTE_POOL = [];
    const pool = [...available];
    for (let i = 0; i < Math.min(10, pool.length); i++) {
      const idx = Math.floor(Math.random() * pool.length);
      selected.push(pool.splice(idx, 1)[0]);
    }

    // If we don't have enough, pull from the full pool
    if (selected.length < 10) {
      const fullPool = QUOTE_POOL.filter((q) => !selected.some((s) => s.quote === q.quote));
      while (selected.length < 10 && fullPool.length > 0) {
        const idx = Math.floor(Math.random() * fullPool.length);
        selected.push(fullPool.splice(idx, 1)[0]);
      }
    }

    // Insert into database
    for (const q of selected) {
      await convex.mutation(api.bulletin.createQuote, {
        quote: q.quote,
        author: q.author,
        weekStart,
        selected: false,
      });
    }

    // Send to owner via Slack DM
    const allMembers = await convex.query(api.teamMembers.list);
    const owners = allMembers.filter(
      (m: any) => m.roleLevel === "owner" && m.active && m.slackUserId
    );

    if (owners.length > 0) {
      const owner = owners[0];
      let message = `*Weekly Quote Options for ${weekStart}*\n\nPick one for next week's bulletin! React with a number emoji or reply with the number:\n\n`;

      selected.forEach((q, i) => {
        const authorStr = q.author ? ` — _${q.author}_` : "";
        message += `*${i + 1}.* "${q.quote}"${authorStr}\n\n`;
      });

      message += "_React with :one: through :keycap_ten: or reply with a number (1-10) to select._";

      const result = await sendSlackDM(owner.slackUserId as string, message);
      await logSlackMessage(
        owner._id as any,
        "weekly_quotes",
        message,
        result.ts
      );
    }

    return NextResponse.json({ success: true, quotesGenerated: selected.length });
  } catch (error) {
    console.error("Weekly quotes cron error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate quotes" },
      { status: 500 }
    );
  }
}
