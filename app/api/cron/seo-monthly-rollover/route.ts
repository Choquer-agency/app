import { NextRequest, NextResponse } from "next/server";
import { getAllClients } from "@/lib/clients";
import { getClientPackages } from "@/lib/client-packages";
import { getAllTeamMembers } from "@/lib/team-members";
import {
  listMonthsForClient,
  monthKeyOf,
  saveMonth,
  EMPTY_TIPTAP_DOC,
} from "@/lib/seo-strategy-months";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { createTicket } from "@/lib/tickets";
import {
  addCalendarDaysThenSnapToBusinessDay,
  loadHolidaySet,
} from "@/lib/business-days";
import type { Id } from "@/convex/_generated/dataModel";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  let m = month + delta;
  let y = year;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return { year: y, month: m };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const isDev = process.env.NODE_ENV === "development";
  if (!isDev && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const convex = getConvexClient();
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1;
    const prev = addMonths(todayYear, todayMonth, -1);
    const future = addMonths(todayYear, todayMonth, 3);

    const clients = await getAllClients();
    const teamMembers = await getAllTeamMembers();
    const teamByName = new Map(teamMembers.map((t) => [t.name, t]));
    const holidays = await loadHolidaySet();
    const firstOfMonth = new Date(todayYear, todayMonth - 1, 1);
    const dueDate = addCalendarDaysThenSnapToBusinessDay(
      firstOfMonth,
      14,
      holidays
    )
      .toISOString()
      .slice(0, 10);

    const results: { clientId: string; clientName: string; actions: string[] }[] = [];

    for (const client of clients) {
      if (client.clientStatus !== "active" && client.clientStatus !== "new") continue;

      const packages = await getClientPackages(client.id);
      const hasSeo = packages.some((cp) => cp.active && cp.packageCategory === "seo");
      if (!hasSeo) continue;

      const months = await listMonthsForClient(client.id);
      const byKey = new Map(months.map((m) => [m.monthKey, m]));
      const actions: string[] = [];

      const prevKey = monthKeyOf(prev.year, prev.month);
      const prevRow = byKey.get(prevKey);
      if (prevRow && prevRow.status === "active") {
        await convex.mutation(api.seoStrategyMonths.setStatus, {
          id: prevRow.id as Id<"seoStrategyMonths">,
          status: "complete",
        });
        actions.push(`marked ${prevKey} complete`);
      }

      const currentKey = monthKeyOf(todayYear, todayMonth);
      const currentRow = byKey.get(currentKey);
      if (!currentRow) {
        await saveMonth({
          clientId: client.id,
          clientSlug: client.slug,
          monthKey: currentKey,
          rawContent: EMPTY_TIPTAP_DOC,
          status: "active",
        });
        actions.push(`created active ${currentKey}`);
      } else if (currentRow.status !== "active") {
        await convex.mutation(api.seoStrategyMonths.setStatus, {
          id: currentRow.id as Id<"seoStrategyMonths">,
          status: "active",
        });
        actions.push(`promoted ${currentKey} to active`);
      }

      const futureKey = monthKeyOf(future.year, future.month);
      if (!byKey.get(futureKey)) {
        await saveMonth({
          clientId: client.id,
          clientSlug: client.slug,
          monthKey: futureKey,
          rawContent: EMPTY_TIPTAP_DOC,
          status: "forecast",
        });
        actions.push(`stubbed forecast ${futureKey}`);
      }

      const specialist = client.accountSpecialist
        ? teamByName.get(client.accountSpecialist)
        : null;
      if (specialist) {
        const futureMonthLabel = `${MONTH_NAMES[future.month - 1]} ${future.year}`;

        const description = JSON.stringify({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: `Plan ${client.name}'s SEO strategy for ${futureMonthLabel}. Open the SEO Strategy tab on the client profile and fill in the ${futureMonthLabel} section.`,
                },
              ],
            },
            {
              type: "bulletList",
              content: [
                { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Define focus areas and goals" }] }] },
                { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "List planned tasks" }] }] },
                { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Note any deliverables or approvals" }] }] },
              ],
            },
          ],
        });

        try {
          await createTicket(
            {
              title: `${client.name} – Plan ${MONTH_NAMES[future.month - 1]} strategy`,
              description,
              descriptionFormat: "tiptap",
              clientId: client.id,
              status: "needs_attention",
              priority: "normal",
              dueDate,
              assigneeIds: [specialist.id],
              serviceCategory: "seo",
            },
            specialist.id
          );
          actions.push(`created planning ticket for ${specialist.name}`);
        } catch (err) {
          actions.push(
            `ticket failed: ${err instanceof Error ? err.message : "unknown"}`
          );
        }
      }

      results.push({ clientId: client.id, clientName: client.name, actions });
    }

    return NextResponse.json({ rolloverDate: today.toISOString(), processed: results.length, results });
  } catch (error) {
    console.error("seo-monthly-rollover failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron failed" },
      { status: 500 }
    );
  }
}
