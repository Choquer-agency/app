import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { ServiceBoardEntry, ServiceBoardCategory, ServiceBoardStatus } from "@/types";
import { getServiceHourCap } from "./time-entries";
import { getEnrichedContent } from "./db";
import { getGSCKPIs } from "./gsc";
import { getGA4KPIs } from "./ga4";

// === Doc Mapper ===

function docToEntry(doc: any): ServiceBoardEntry {
  return {
    id: doc._id,
    clientId: doc.clientId,
    clientPackageId: doc.clientPackageId,
    category: doc.category as ServiceBoardCategory,
    month: doc.month ?? "",
    status: doc.status as ServiceBoardStatus,
    specialistId: doc.specialistId ?? null,
    monthlyEmailSentAt: doc.monthlyEmailSentAt ?? null,
    quarterlyEmailSentAt: doc.quarterlyEmailSentAt ?? null,
    notes: doc.notes ?? "",
    createdAt: doc._creationTime
      ? new Date(doc._creationTime).toISOString()
      : "",
    updatedAt: doc._creationTime
      ? new Date(doc._creationTime).toISOString()
      : "",
    // Joined fields (populated separately if needed)
    clientName: doc.clientName ?? undefined,
    clientSlug: doc.clientSlug ?? undefined,
    clientNotionPageUrl: doc.clientNotionPageUrl ?? undefined,
    packageName: doc.packageName ?? undefined,
    includedHours: doc.includedHours ?? undefined,
    specialistName: doc.specialistName ?? undefined,
    specialistColor: doc.specialistColor ?? undefined,
    specialistProfilePicUrl: doc.specialistProfilePicUrl ?? undefined,
    generatedEmail: doc.generatedEmail ?? undefined,
    commentCount: doc.commentCount ?? undefined,
  };
}

/**
 * Ensure service board entries exist for all active client packages
 * of the given category for the given month.
 */
export async function ensureServiceBoardEntries(
  category: ServiceBoardCategory,
  month: string
): Promise<void> {
  const convex = getConvexClient();

  // Get all active client packages for this category
  const activePackages = await convex.query(api.clientPackages.listActiveByCategory, {
    category,
  });

  // Create entries for each one (dedup handled by createIfNotExists)
  for (const cp of activePackages as any[]) {
    await convex.mutation(api.serviceBoardEntries.createIfNotExists, {
      clientId: cp.clientId,
      clientPackageId: cp._id,
      category,
      month,
    });
  }
}

/**
 * Get all service board entries for a category and month.
 */
export async function getServiceBoardEntries(
  category: ServiceBoardCategory,
  month: string
): Promise<ServiceBoardEntry[]> {
  await ensureServiceBoardEntries(category, month);

  const convex = getConvexClient();
  const docs = await convex.query(api.serviceBoardEntries.list, {
    category,
    month,
  });

  const entries = docs.map(docToEntry);

  // Compute hours for each entry
  for (const entry of entries) {
    try {
      const summary = await getServiceHourCap(
        entry.clientId,
        category,
        entry.clientPackageId,
        month
      );
      entry.loggedHours = summary.loggedHours;
      entry.percentUsed = summary.percentUsed;
      entry.hourStatus = summary.status;
    } catch {
      // Hour computation may fail if data is missing
    }
  }

  return entries;
}

/**
 * Get a single service board entry by ID.
 */
export async function getServiceBoardEntryById(
  id: number | string
): Promise<ServiceBoardEntry | null> {
  const convex = getConvexClient();
  const doc = await convex.query(api.serviceBoardEntries.getById, {
    id: id as any,
  });
  if (!doc) return null;

  const entry = docToEntry(doc);

  try {
    const summary = await getServiceHourCap(
      entry.clientId,
      entry.category,
      entry.clientPackageId,
      entry.month
    );
    entry.loggedHours = summary.loggedHours;
    entry.percentUsed = summary.percentUsed;
    entry.hourStatus = summary.status;
  } catch {
    // Hour computation may fail
  }

  return entry;
}

/**
 * Update a service board entry (status, specialist, notes).
 */
export async function updateServiceBoardEntry(
  id: number | string,
  data: {
    status?: ServiceBoardStatus;
    specialistId?: number | string | null;
    notes?: string;
  }
): Promise<ServiceBoardEntry | null> {
  const convex = getConvexClient();
  const updateData: Record<string, any> = { id: id as any };
  if (data.status !== undefined) updateData.status = data.status;
  if (data.specialistId !== undefined) {
    updateData.specialistId = data.specialistId
      ? (data.specialistId as any)
      : undefined;
  }
  if (data.notes !== undefined) updateData.notes = data.notes;

  await convex.mutation(api.serviceBoardEntries.update, updateData as any);
  return getServiceBoardEntryById(id);
}

/**
 * Mark email as sent for a service board entry.
 */
export async function markEmailSent(
  id: number | string,
  isQuarterly: boolean
): Promise<ServiceBoardEntry | null> {
  const convex = getConvexClient();
  const now = new Date().toISOString();

  const updateData: Record<string, any> = {
    id: id as any,
    status: "email_sent",
  };
  if (isQuarterly) {
    updateData.quarterlyEmailSentAt = now;
  } else {
    updateData.monthlyEmailSentAt = now;
  }

  await convex.mutation(api.serviceBoardEntries.update, updateData as any);
  return getServiceBoardEntryById(id);
}

/**
 * Get or create a service ticket for time tracking.
 * This still requires ticket creation which is in the tickets lib.
 */
export async function getOrCreateServiceTicket(
  clientId: number | string,
  category: ServiceBoardCategory,
  month: string,
  createdById: number | string
): Promise<{ ticketId: string; ticketNumber: string }> {
  const convex = getConvexClient();
  const categoryLabel = category === "google_ads" ? "Google Ads" : category === "seo" ? "SEO" : "Retainer";
  const monthLabel = new Date(month + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const title = `${categoryLabel} — ${monthLabel}`;

  // Check for existing service ticket
  const existing = await convex.query(api.tickets.list, {
    clientId: clientId as any,
    archived: false,
    limit: 200,
  });

  const match = (existing as any[]).find(
    (t) => t.serviceCategory === category && t.title === title
  );

  if (match) {
    return { ticketId: match._id, ticketNumber: match.ticketNumber };
  }

  // Create new service ticket
  const { createTicket } = await import("./tickets");
  const ticket = await createTicket(
    {
      title,
      description: `Service tracking ticket for ${categoryLabel} work in ${monthLabel}`,
      clientId: clientId as any,
      serviceCategory: category,
    },
    createdById as any,
    { id: createdById as any, name: "System" }
  );

  return { ticketId: ticket.id as string, ticketNumber: ticket.ticketNumber };
}

/**
 * Check if a month is a quarterly email month (Jan, Apr, Jul, Oct).
 */
export function isQuarterlyMonth(month: string): boolean {
  const d = new Date(month);
  const m = d.getMonth();
  return m === 0 || m === 3 || m === 6 || m === 9;
}

/**
 * Get historical entries for a client package across all months.
 */
export async function getServiceBoardHistory(
  clientPackageId: number | string
): Promise<ServiceBoardEntry[]> {
  const convex = getConvexClient();
  // The Convex list query doesn't have a by_package filter directly.
  // Fetch all for the client and filter in JS.
  const all = await convex.query(api.serviceBoardEntries.list, {});
  const filtered = all.filter(
    (doc: any) => doc.clientPackageId === clientPackageId
  );
  return filtered.map(docToEntry);
}

/**
 * Get all team members for specialist dropdown.
 */
export async function getActiveTeamMembers(): Promise<
  Array<{ id: string; name: string; color: string; profilePicUrl: string }>
> {
  const convex = getConvexClient();
  const docs = await convex.query(api.teamMembers.list, {});
  return docs
    .filter((d: any) => d.active !== false)
    .map((d: any) => ({
      id: d._id as string,
      name: d.name ?? "",
      color: d.color ?? "#6B7280",
      profilePicUrl: d.profilePicUrl ?? "",
    }));
}

/**
 * Generate a monthly email for a client when status changes to report_ready.
 */
export async function generateMonthlyEmail(
  entryId: number | string
): Promise<string> {
  const entry = await getServiceBoardEntryById(entryId);
  if (!entry) return "";

  const monthDate = new Date(entry.month + "T12:00:00");
  const monthName = monthDate.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  const categoryLabel =
    entry.category === "google_ads"
      ? "Google Ads"
      : entry.category === "seo"
        ? "SEO"
        : "Retainer";

  // Get client details
  const convex = getConvexClient();
  let contactName = "there";
  let calLink = "";
  let slug = "";
  let gscSiteUrl = "";
  let ga4PropertyId = "";

  try {
    const client = await convex.query(api.clients.getById, {
      id: entry.clientId as any,
    });
    if (client) {
      contactName = (client as any).contactName || "there";
      calLink = (client as any).calLink || "";
      slug = (client as any).slug || "";
      gscSiteUrl = (client as any).gscSiteUrl || "";
      ga4PropertyId = (client as any).ga4PropertyId || "";
    }
  } catch {
    // Client may not exist
  }

  // Pull enriched content
  let summary = "";
  let workItems: Array<{ task: string; links: string[] }> = [];
  let goalHighlights: string[] = [];
  try {
    if (slug) {
      const enriched = await getEnrichedContent(slug);
      if (enriched?.enrichedData) {
        const data = enriched.enrichedData as Record<string, unknown>;
        const currentMonth = data.currentMonth as
          | Record<string, unknown>
          | undefined;
        if (currentMonth?.summary) {
          summary = currentMonth.summary as string;
        }
        const tasks = (currentMonth?.tasks || []) as Array<
          Record<string, unknown>
        >;
        workItems = tasks
          .filter((t) => t.completed !== false)
          .map((t) => {
            const task = (t.task as string) || "";
            const deliverableLinks = (t.deliverableLinks as string[]) || [];
            const subtasks = t.subtasks;
            const subtaskLinks: string[] = [];
            if (Array.isArray(subtasks)) {
              for (const st of subtasks as Array<Record<string, unknown>>) {
                if (st.link) subtaskLinks.push(st.link as string);
              }
            }
            const allLinks = [
              ...new Set(
                [...deliverableLinks, ...subtaskLinks].filter(Boolean)
              ),
            ];
            const publicLinks = allLinks.filter(
              (l) =>
                !l.includes("docs.google.com") &&
                !l.includes("notion.so") &&
                !l.includes("drive.google.com")
            );
            return { task, links: publicLinks };
          })
          .filter((w) => w.task)
          .slice(0, 5);
        const goals = (data.goals || []) as Array<Record<string, unknown>>;
        goalHighlights = goals
          .map((g) => {
            const goal = g.goal as string;
            const progress = g.progress as number;
            return progress !== undefined
              ? `${goal} (${progress}% complete)`
              : goal;
          })
          .filter(Boolean)
          .slice(0, 3);
      }
    }
  } catch {
    // Enriched content may not exist
  }

  // Pull live analytics
  let metricsBlock = "";
  try {
    const metrics: string[] = [];

    if (gscSiteUrl) {
      const gsc = await getGSCKPIs(gscSiteUrl, "28d");
      if (gsc?.clicks) {
        const clickChange = gsc.clicks.changePercent;
        const clickDir = clickChange >= 0 ? "+" : "";
        metrics.push(
          `Organic Clicks: ${gsc.clicks.value.toLocaleString()} (${clickDir}${clickChange.toFixed(1)}% vs last period)`
        );
      }
      if (gsc?.impressions) {
        metrics.push(
          `Search Impressions: ${gsc.impressions.value.toLocaleString()}`
        );
      }
    }

    if (ga4PropertyId) {
      const ga4 = await getGA4KPIs(ga4PropertyId);
      if (ga4?.organicSessions) {
        const sessChange = ga4.organicSessions.changePercent;
        const sessDir = sessChange >= 0 ? "+" : "";
        metrics.push(
          `Organic Sessions: ${ga4.organicSessions.value.toLocaleString()} (${sessDir}${sessChange.toFixed(1)}%)`
        );
      }
    }

    if (metrics.length > 0) {
      metricsBlock =
        "\n\nKey Metrics This Month:\n" +
        metrics.map((m) => `  - ${m}`).join("\n");
    }
  } catch {
    // Analytics may not be configured
  }

  // Build deliverables section
  let deliverables = "";
  if (workItems.length > 0) {
    const lines = workItems.map((w) => {
      if (w.links.length > 0) {
        return `  - ${w.task}\n    ${w.links.join("\n    ")}`;
      }
      return `  - ${w.task}`;
    });
    deliverables = "\n\nWhat We Accomplished:\n" + lines.join("\n");
  }

  // Build goals section
  let goalsSection = "";
  if (goalHighlights.length > 0) {
    goalsSection =
      "\n\nGoal Progress:\n" +
      goalHighlights.map((g) => `  - ${g}`).join("\n");
  }

  // Compose the email
  const firstName = contactName.split(" ")[0];
  const greetings = [
    `Hey ${firstName},\n\nHope you're doing well!`,
    `Hey ${firstName},\n\nHope you're having a good week!`,
  ];
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];

  const intro = summary
    ? ` Here's your ${monthName} ${categoryLabel} update \u2014 ${summary.charAt(0).toLowerCase() + summary.slice(1)}`
    : ` Here's a quick look at what our team accomplished on your ${categoryLabel} account this month.`;

  const closing = calLink
    ? `\n\nWould love to walk you through everything on a quick 15-minute call and chat about what's next. You can book a time here:\n${calLink}`
    : `\n\nWould love to hop on a quick 15-minute call to walk you through the results and chat about priorities for next month.`;

  const email = `${greeting}${intro}${metricsBlock}${deliverables}${goalsSection}${closing}

Talk soon,
The Choquer Agency Team`;

  // Save to Convex
  await convex.mutation(api.serviceBoardEntries.update, {
    id: entryId as any,
    generatedEmail: email,
  });

  return email;
}

/**
 * Save an edited email back to the entry.
 */
export async function saveGeneratedEmail(
  entryId: number | string,
  email: string
): Promise<void> {
  const convex = getConvexClient();
  await convex.mutation(api.serviceBoardEntries.update, {
    id: entryId as any,
    generatedEmail: email,
  });
}
