import { sql } from "@vercel/postgres";
import { ServiceBoardEntry, ServiceBoardCategory, ServiceBoardStatus } from "@/types";
import { getServiceHourCap } from "./time-entries";
import { getEnrichedContent } from "./db";
import { getGSCKPIs } from "./gsc";
import { getGA4KPIs } from "./ga4";

function rowToEntry(row: Record<string, unknown>): ServiceBoardEntry {
  return {
    id: row.id as number,
    clientId: row.client_id as number,
    clientPackageId: row.client_package_id as number,
    category: row.category as ServiceBoardCategory,
    month: row.month ? (row.month as Date).toISOString().split("T")[0] : "",
    status: row.status as ServiceBoardStatus,
    specialistId: (row.specialist_id as number) ?? null,
    monthlyEmailSentAt: row.monthly_email_sent_at
      ? (row.monthly_email_sent_at as Date).toISOString()
      : null,
    quarterlyEmailSentAt: row.quarterly_email_sent_at
      ? (row.quarterly_email_sent_at as Date).toISOString()
      : null,
    notes: (row.notes as string) || "",
    createdAt: (row.created_at as Date)?.toISOString() || "",
    updatedAt: (row.updated_at as Date)?.toISOString() || "",
    // Joined fields
    clientName: (row.client_name as string) || undefined,
    clientSlug: (row.client_slug as string) || undefined,
    clientNotionPageUrl: (row.client_notion_page_url as string) || undefined,
    packageName: (row.package_name as string) || undefined,
    includedHours: row.included_hours
      ? parseFloat(row.included_hours as string)
      : undefined,
    specialistName: (row.specialist_name as string) || undefined,
    specialistColor: (row.specialist_color as string) || undefined,
    specialistProfilePicUrl: (row.specialist_profile_pic_url as string) || undefined,
    generatedEmail: (row.generated_email as string) || undefined,
    commentCount: row.comment_count !== undefined ? Number(row.comment_count) : undefined,
  };
}

/**
 * Ensure service board entries exist for all active client packages
 * of the given category for the given month. Lazy evaluation — no cron needed.
 */
export async function ensureServiceBoardEntries(
  category: ServiceBoardCategory,
  month: string
): Promise<void> {
  // Get all active client_packages for this category
  const { rows: packages } = await sql`
    SELECT cp.id AS cp_id, cp.client_id, c.account_specialist
    FROM client_packages cp
    JOIN packages p ON p.id = cp.package_id
    JOIN clients c ON c.id = cp.client_id
    WHERE p.category = ${category}
      AND cp.active = true
      AND c.active = true
  `;

  for (const pkg of packages) {
    const cpId = pkg.cp_id as number;
    const clientId = pkg.client_id as number;

    // Check if entry already exists
    const { rows: existing } = await sql`
      SELECT id FROM service_board_entries
      WHERE client_package_id = ${cpId} AND month = ${month}::date
    `;

    if (existing.length === 0) {
      // Carry forward specialist from previous month
      const { rows: prev } = await sql`
        SELECT specialist_id FROM service_board_entries
        WHERE client_package_id = ${cpId}
        ORDER BY month DESC LIMIT 1
      `;
      const specialistId = prev.length > 0 ? (prev[0].specialist_id as number | null) : null;

      await sql`
        INSERT INTO service_board_entries (client_id, client_package_id, category, month, specialist_id)
        VALUES (${clientId}, ${cpId}, ${category}, ${month}::date, ${specialistId})
        ON CONFLICT (client_package_id, month) DO NOTHING
      `;
    }
  }
}

/**
 * Get all service board entries for a category and month, with joined data.
 */
export async function getServiceBoardEntries(
  category: ServiceBoardCategory,
  month: string
): Promise<ServiceBoardEntry[]> {
  // Ensure entries exist first (lazy creation)
  await ensureServiceBoardEntries(category, month);

  const { rows } = await sql`
    SELECT sbe.*,
      c.name AS client_name,
      c.slug AS client_slug,
      c.notion_page_url AS client_notion_page_url,
      p.name AS package_name,
      COALESCE(cp.custom_hours, p.hours_included, 0) AS included_hours,
      tm.name AS specialist_name,
      tm.color AS specialist_color,
      tm.profile_pic_url AS specialist_profile_pic_url
    FROM service_board_entries sbe
    JOIN clients c ON c.id = sbe.client_id
    JOIN client_packages cp ON cp.id = sbe.client_package_id
    JOIN packages p ON p.id = cp.package_id
    LEFT JOIN team_members tm ON tm.id = sbe.specialist_id
    WHERE sbe.category = ${category}
      AND sbe.month = ${month}::date
    ORDER BY c.name ASC
  `;

  const entries = rows.map(rowToEntry);

  // Compute hours for each entry
  for (const entry of entries) {
    const summary = await getServiceHourCap(
      entry.clientId,
      category,
      entry.clientPackageId,
      month
    );
    entry.loggedHours = summary.loggedHours;
    entry.percentUsed = summary.percentUsed;
    entry.hourStatus = summary.status;
  }

  return entries;
}

/**
 * Get a single service board entry by ID with joined data.
 */
export async function getServiceBoardEntryById(
  id: number
): Promise<ServiceBoardEntry | null> {
  const { rows } = await sql`
    SELECT sbe.*,
      c.name AS client_name,
      c.slug AS client_slug,
      c.notion_page_url AS client_notion_page_url,
      p.name AS package_name,
      COALESCE(cp.custom_hours, p.hours_included, 0) AS included_hours,
      tm.name AS specialist_name,
      tm.color AS specialist_color,
      tm.profile_pic_url AS specialist_profile_pic_url
    FROM service_board_entries sbe
    JOIN clients c ON c.id = sbe.client_id
    JOIN client_packages cp ON cp.id = sbe.client_package_id
    JOIN packages p ON p.id = cp.package_id
    LEFT JOIN team_members tm ON tm.id = sbe.specialist_id
    WHERE sbe.id = ${id}
  `;

  if (rows.length === 0) return null;
  const entry = rowToEntry(rows[0]);

  const summary = await getServiceHourCap(
    entry.clientId,
    entry.category,
    entry.clientPackageId,
    entry.month
  );
  entry.loggedHours = summary.loggedHours;
  entry.percentUsed = summary.percentUsed;
  entry.hourStatus = summary.status;

  return entry;
}

/**
 * Update a service board entry (status, specialist, notes).
 */
export async function updateServiceBoardEntry(
  id: number,
  data: {
    status?: ServiceBoardStatus;
    specialistId?: number | null;
    notes?: string;
  }
): Promise<ServiceBoardEntry | null> {
  const existing = await sql`SELECT * FROM service_board_entries WHERE id = ${id}`;
  if (existing.rows.length === 0) return null;

  const current = existing.rows[0];
  const status = data.status ?? (current.status as string);
  const specialistId = data.specialistId !== undefined ? data.specialistId : (current.specialist_id as number | null);
  const notes = data.notes ?? (current.notes as string);

  await sql`
    UPDATE service_board_entries SET
      status = ${status},
      specialist_id = ${specialistId},
      notes = ${notes},
      updated_at = NOW()
    WHERE id = ${id}
  `;

  return getServiceBoardEntryById(id);
}

/**
 * Mark email as sent for a service board entry.
 */
export async function markEmailSent(
  id: number,
  isQuarterly: boolean
): Promise<ServiceBoardEntry | null> {
  if (isQuarterly) {
    await sql`
      UPDATE service_board_entries SET
        quarterly_email_sent_at = NOW(),
        status = 'email_sent',
        updated_at = NOW()
      WHERE id = ${id}
    `;
  } else {
    await sql`
      UPDATE service_board_entries SET
        monthly_email_sent_at = NOW(),
        status = 'email_sent',
        updated_at = NOW()
      WHERE id = ${id}
    `;
  }

  return getServiceBoardEntryById(id);
}

/**
 * Get or create a service ticket for time tracking.
 * Auto-creates one ticket per client/category/month when first needed.
 */
export async function getOrCreateServiceTicket(
  clientId: number,
  category: ServiceBoardCategory,
  month: string,
  createdById: number
): Promise<{ ticketId: number; ticketNumber: string }> {
  const monthStart = new Date(month);
  const monthLabel = monthStart.toLocaleString("en-US", { month: "long", year: "numeric" });
  const categoryLabel = category === "google_ads" ? "Google Ads" : category === "seo" ? "SEO" : "Retainer";

  // Check if a service ticket already exists for this client/category/month
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const { rows: existing } = await sql`
    SELECT id, ticket_number FROM tickets
    WHERE client_id = ${clientId}
      AND service_category = ${category}
      AND created_at >= ${monthStart.toISOString()}::timestamptz
      AND created_at < ${monthEnd.toISOString()}::timestamptz
      AND archived = false
    LIMIT 1
  `;

  if (existing.length > 0) {
    return {
      ticketId: existing[0].id as number,
      ticketNumber: existing[0].ticket_number as string,
    };
  }

  // Get client name
  const { rows: clientRows } = await sql`SELECT name FROM clients WHERE id = ${clientId}`;
  const clientName = clientRows.length > 0 ? (clientRows[0].name as string) : "Client";

  // Create new service ticket
  const { rows: seqRows } = await sql`SELECT nextval('ticket_number_seq') AS num`;
  const ticketNumber = `CHQ-${String(seqRows[0].num).padStart(3, "0")}`;

  const title = `${clientName} - ${categoryLabel} - ${monthLabel}`;

  const { rows: newTicket } = await sql`
    INSERT INTO tickets (ticket_number, title, client_id, status, priority, service_category, created_by_id)
    VALUES (${ticketNumber}, ${title}, ${clientId}, 'in_progress', 'normal', ${category}, ${createdById})
    RETURNING id, ticket_number
  `;

  return {
    ticketId: newTicket[0].id as number,
    ticketNumber: newTicket[0].ticket_number as string,
  };
}

/**
 * Check if a month is a quarterly email month (Jan, Apr, Jul, Oct).
 */
export function isQuarterlyMonth(month: string): boolean {
  const d = new Date(month);
  const m = d.getMonth(); // 0-indexed
  return m === 0 || m === 3 || m === 6 || m === 9;
}

/**
 * Get historical entries for a client package across all months.
 */
export async function getServiceBoardHistory(
  clientPackageId: number
): Promise<ServiceBoardEntry[]> {
  const { rows } = await sql`
    SELECT sbe.*,
      c.name AS client_name,
      c.slug AS client_slug,
      c.notion_page_url AS client_notion_page_url,
      p.name AS package_name,
      COALESCE(cp.custom_hours, p.hours_included, 0) AS included_hours,
      tm.name AS specialist_name,
      tm.color AS specialist_color,
      tm.profile_pic_url AS specialist_profile_pic_url
    FROM service_board_entries sbe
    JOIN clients c ON c.id = sbe.client_id
    JOIN client_packages cp ON cp.id = sbe.client_package_id
    JOIN packages p ON p.id = cp.package_id
    LEFT JOIN team_members tm ON tm.id = sbe.specialist_id
    WHERE sbe.client_package_id = ${clientPackageId}
    ORDER BY sbe.month DESC
  `;

  return rows.map(rowToEntry);
}

/**
 * Get all team members for specialist dropdown.
 */
export async function getActiveTeamMembers(): Promise<
  Array<{ id: number; name: string; color: string; profilePicUrl: string }>
> {
  const { rows } = await sql`
    SELECT id, name, color, profile_pic_url
    FROM team_members
    WHERE active = true
    ORDER BY name ASC
  `;
  return rows.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    color: (r.color as string) || "#6B7280",
    profilePicUrl: (r.profile_pic_url as string) || "",
  }));
}

/**
 * Generate a monthly email for a client when status changes to report_ready.
 * Pulls real data from the client's InsightPulse dashboard: enriched content,
 * GSC metrics, GA4 sessions, work log, and goals.
 */
export async function generateMonthlyEmail(
  entryId: number
): Promise<string> {
  const entry = await getServiceBoardEntryById(entryId);
  if (!entry) return "";

  const monthDate = new Date(entry.month + "T12:00:00");
  const monthName = monthDate.toLocaleString("en-US", { month: "long", year: "numeric" });
  const categoryLabel = entry.category === "google_ads" ? "Google Ads" : entry.category === "seo" ? "SEO" : "Retainer";

  // Get client details
  const { rows: clientRows } = await sql`
    SELECT c.cal_link, c.contact_name, c.slug, c.gsc_site_url, c.ga4_property_id
    FROM clients c WHERE c.id = ${entry.clientId}
  `;
  const client = clientRows[0] || {};
  const contactName = (client.contact_name as string) || "there";
  const calLink = (client.cal_link as string) || "";
  const slug = (client.slug as string) || "";
  const gscSiteUrl = (client.gsc_site_url as string) || "";
  const ga4PropertyId = (client.ga4_property_id as string) || "";

  // Pull enriched content (work log, summary, goals)
  let summary = "";
  let workItems: Array<{ task: string; links: string[] }> = [];
  let goalHighlights: string[] = [];
  try {
    if (slug) {
      const enriched = await getEnrichedContent(slug);
      if (enriched?.enrichedData) {
        const data = enriched.enrichedData as Record<string, unknown>;
        const currentMonth = data.currentMonth as Record<string, unknown> | undefined;
        if (currentMonth?.summary) {
          summary = currentMonth.summary as string;
        }
        // Extract completed tasks with their deliverable links
        const tasks = (currentMonth?.tasks || []) as Array<Record<string, unknown>>;
        workItems = tasks
          .filter((t) => t.completed !== false)
          .map((t) => {
            const task = (t.task as string) || "";
            const deliverableLinks = (t.deliverableLinks as string[]) || [];
            // Also check subtasks for links
            const subtasks = t.subtasks;
            const subtaskLinks: string[] = [];
            if (Array.isArray(subtasks)) {
              for (const st of subtasks as Array<Record<string, unknown>>) {
                if (st.link) subtaskLinks.push(st.link as string);
              }
            }
            // Deduplicate and exclude internal draft links (Google Docs, Notion, etc.)
            const allLinks = [...new Set([...deliverableLinks, ...subtaskLinks].filter(Boolean))];
            const publicLinks = allLinks.filter(
              (l) => !l.includes("docs.google.com") && !l.includes("notion.so") && !l.includes("drive.google.com")
            );
            return { task, links: publicLinks };
          })
          .filter((w) => w.task)
          .slice(0, 5);
        // Extract goals
        const goals = (data.goals || []) as Array<Record<string, unknown>>;
        goalHighlights = goals
          .map((g) => {
            const goal = g.goal as string;
            const progress = g.progress as number;
            return progress !== undefined ? `${goal} (${progress}% complete)` : goal;
          })
          .filter(Boolean)
          .slice(0, 3);
      }
    }
  } catch {
    // Enriched content may not exist for all clients
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
        metrics.push(`Organic Clicks: ${gsc.clicks.value.toLocaleString()} (${clickDir}${clickChange.toFixed(1)}% vs last period)`);
      }
      if (gsc?.impressions) {
        metrics.push(`Search Impressions: ${gsc.impressions.value.toLocaleString()}`);
      }
    }

    if (ga4PropertyId) {
      const ga4 = await getGA4KPIs(ga4PropertyId);
      if (ga4?.organicSessions) {
        const sessChange = ga4.organicSessions.changePercent;
        const sessDir = sessChange >= 0 ? "+" : "";
        metrics.push(`Organic Sessions: ${ga4.organicSessions.value.toLocaleString()} (${sessDir}${sessChange.toFixed(1)}%)`);
      }
    }

    if (metrics.length > 0) {
      metricsBlock = "\n\nKey Metrics This Month:\n" + metrics.map((m) => `  - ${m}`).join("\n");
    }
  } catch {
    // Analytics may not be configured
  }

  // Build deliverables section with links
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
    goalsSection = "\n\nGoal Progress:\n" + goalHighlights.map((g) => `  - ${g}`).join("\n");
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

  // Save to DB
  await sql`
    UPDATE service_board_entries
    SET generated_email = ${email}, updated_at = NOW()
    WHERE id = ${entryId}
  `;

  return email;
}

/**
 * Save an edited email back to the entry.
 */
export async function saveGeneratedEmail(
  entryId: number,
  email: string
): Promise<void> {
  await sql`
    UPDATE service_board_entries
    SET generated_email = ${email}, updated_at = NOW()
    WHERE id = ${entryId}
  `;
}
