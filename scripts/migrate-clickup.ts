/**
 * ClickUp CSV Migration Script
 *
 * Migrates clients, tickets, and leads from ClickUp CSV exports into Convex.
 *
 * Usage:
 *   npx tsx scripts/migrate-clickup.ts
 *   npx tsx scripts/migrate-clickup.ts --phase=clients
 *   npx tsx scripts/migrate-clickup.ts --phase=tickets
 *   npx tsx scripts/migrate-clickup.ts --phase=leads
 *   npx tsx scripts/migrate-clickup.ts --dry-run
 *
 * Requires:
 *   - NEXT_PUBLIC_CONVEX_URL in .env.local
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parse } from "csv-parse/sync";

// ────────────────────────────────────────────────────────────────────────────
// Setup
// ────────────────────────────────────────────────────────────────────────────

const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    process.env[match[1].trim()] = match[2].trim();
  }
}

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!CONVEX_URL) throw new Error("Missing NEXT_PUBLIC_CONVEX_URL in .env.local");

const convex = new ConvexHttpClient(CONVEX_URL);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const phaseArg = args.find((a) => a.startsWith("--phase="));
const PHASE = phaseArg ? phaseArg.split("=")[1] : "all";

function log(msg: string) {
  console.log(`[migrate] ${msg}`);
}

// ────────────────────────────────────────────────────────────────────────────
// CSV File Paths
// ────────────────────────────────────────────────────────────────────────────

const DOWNLOADS = "/Users/brycechoquer/Downloads";

const CLIENTS_CSV = resolve(
  DOWNLOADS,
  "2026-03-25T00_58_50.694Z Choquer Creative - CRM - Clients (1).csv"
);

const TICKETS_CSV = resolve(
  DOWNLOADS,
  "2026-03-24T22_54_24.674Z Choquer Creative - Client Work - Choquer Tasks - All Clients.csv"
);

const LEADS_CSV = resolve(
  DOWNLOADS,
  "2026-03-25T00_59_09.277Z Choquer Creative - CRM - Leads (1).csv"
);

// ────────────────────────────────────────────────────────────────────────────
// Date Parsing
// ────────────────────────────────────────────────────────────────────────────

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12",
};

function parseClickUpDate(dateStr: string): string | undefined {
  if (!dateStr || !dateStr.trim()) return undefined;

  // Strip day-of-week prefix: "Monday, January 1st 2018" -> "January 1st 2018"
  // Also handles datetime: "Thursday, September 12th 2024, 8:25:33 am -07:00"
  let s = dateStr.trim();

  // Remove leading day name + comma
  const dayComma = s.match(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*/i);
  if (dayComma) {
    s = s.substring(dayComma[0].length);
  }

  // Extract month, day, year from "January 1st 2018" or "March 5th 2026, 3:49:46 pm"
  const match = s.match(/^(\w+)\s+(\d+)(?:st|nd|rd|th)\s+(\d{4})/i);
  if (!match) return undefined;

  const monthName = match[1].toLowerCase();
  const day = match[2].padStart(2, "0");
  const year = match[3];
  const month = MONTHS[monthName];

  if (!month) return undefined;
  return `${year}-${month}-${day}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Utility
// ────────────────────────────────────────────────────────────────────────────

function parseCSV(filePath: string): Record<string, string>[] {
  const content = readFileSync(filePath, "utf-8");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  });
}

function parseBracketedList(val: string): string[] {
  if (!val || val === "[]") return [];
  // "[Name1, Name2]" -> ["Name1", "Name2"]
  const inner = val.replace(/^\[|\]$/g, "").trim();
  if (!inner) return [];
  return inner.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseSeoHours(val: string): number | undefined {
  if (!val || !val.trim()) return undefined;
  // "20:00:00" -> 20, "01:00:00" -> 1, "6:00:00" -> 6
  const match = val.match(/^(\d+):/);
  if (match) return parseInt(match[1], 10);
  // Try plain number
  const num = parseFloat(val);
  return isNaN(num) ? undefined : num;
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 1: Migrate Clients
// ────────────────────────────────────────────────────────────────────────────

// clickupTaskId -> convexClientId
const clientIdMap = new Map<string, string>();

async function migrateClients() {
  log("=== Phase 1: Migrating Clients ===");

  const rows = parseCSV(CLIENTS_CSV);
  log(`Parsed ${rows.length} client rows from CSV`);

  // Fetch existing clients to skip duplicates
  const existingClients = await convex.query(api.clients.list, { includeInactive: true });
  const existingNames = new Set(existingClients.map((c: any) => c.name.toLowerCase().trim()));
  log(`Found ${existingClients.length} existing clients in system`);

  // Also build map from existing clients for ticket linking
  // We need to map ClickUp Task IDs to Convex IDs
  for (const row of rows) {
    const taskId = row["Task ID"]?.trim();
    const name = row["Task Name"]?.trim();
    if (taskId && name) {
      // Check if this client already exists
      const existing = existingClients.find(
        (c: any) => c.name.toLowerCase().trim() === name.toLowerCase().trim()
      );
      if (existing) {
        clientIdMap.set(taskId, existing._id);
      }
    }
  }

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = row["Task Name"]?.trim();
    const taskId = row["Task ID"]?.trim();

    if (!name) {
      log(`  SKIP: empty name`);
      skipped++;
      continue;
    }

    // Skip duplicates
    if (existingNames.has(name.toLowerCase().trim())) {
      log(`  SKIP (exists): ${name}`);
      skipped++;
      continue;
    }

    // Determine country from Location column
    const location = row["Location (short text)"]?.trim() || "";
    let country = "CA"; // default
    if (location === "USD") country = "US";
    else if (location === "CAD") country = "CA";

    // Find Notion URL from Monthly Report or Keyword Map
    let notionPageUrl = "";
    const monthlyReport = row["Monthly Report (url)"]?.trim() || "";
    const keywordMap = row["Keyword Map (url)"]?.trim() || "";
    if (monthlyReport.includes("notion.so")) {
      notionPageUrl = monthlyReport;
    } else if (keywordMap.includes("notion.so")) {
      notionPageUrl = keywordMap;
    }

    // Parse sign up date
    const contractStartDate = parseClickUpDate(row["Sign Up Date (date)"] || "");

    // Parse SEO hours
    const seoHoursAllocated = parseSeoHours(row["SEO Hours (short text)"] || "");

    // Parse specialist
    const specialistRaw = row["Specialist (users)"]?.trim() || "";
    const accountSpecialist = parseBracketedList(specialistRaw)[0] || "";

    // Parse status
    const statusRaw = row["Status (drop down)"]?.trim().toLowerCase() || "";
    let clientStatus = "active";
    if (statusRaw === "active") clientStatus = "active";
    else if (statusRaw === "new") clientStatus = "new";
    else if (statusRaw === "offboarding") clientStatus = "offboarding";

    const clientData = {
      name,
      contactName: row["Primary Name (short text)"]?.trim() || undefined,
      contactEmail: row["Company Email (email)"]?.trim() || undefined,
      contactPhone: row["Phone Number (phone)"]?.trim() || undefined,
      addressLine1: row["Address (short text)"]?.trim() || undefined,
      websiteUrl: row["Website (url)"]?.trim() || undefined,
      country,
      notionPageUrl: notionPageUrl || undefined,
      contractStartDate,
      seoHoursAllocated,
      accountSpecialist: accountSpecialist || undefined,
      clientStatus,
    };

    if (DRY_RUN) {
      log(`  DRY RUN: Would create client "${name}"`);
      created++;
      continue;
    }

    try {
      const result = await convex.mutation(api.clients.create, clientData as any);
      if (result && taskId) {
        clientIdMap.set(taskId, result._id);
      }
      existingNames.add(name.toLowerCase().trim());
      created++;
      log(`  CREATED: ${name}`);
    } catch (err) {
      log(`  ERROR creating "${name}": ${err}`);
    }
  }

  log(`Clients done: ${created} created, ${skipped} skipped`);
  log(`Client ID map has ${clientIdMap.size} entries for ticket linking`);
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2: Migrate Tickets
// ────────────────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  "choquer needs attention": "needs_attention",
  stuck: "stuck",
  "in progress": "in_progress",
};

const PRIORITY_MAP: Record<string, string> = {
  NORMAL: "normal",
  HIGH: "high",
  URGENT: "urgent",
  LOW: "low",
  none: "normal",
};

const TARGET_STATUSES = new Set(["choquer needs attention", "stuck", "in progress"]);

async function migrateTickets() {
  log("=== Phase 2: Migrating Tickets ===");

  const rows = parseCSV(TICKETS_CSV);
  log(`Parsed ${rows.length} total ticket rows from CSV`);

  // Filter to target statuses
  const targetRows = rows.filter((r) => {
    const status = r["Status"]?.trim().toLowerCase();
    return TARGET_STATUSES.has(status);
  });
  log(`${targetRows.length} tickets match target statuses`);

  // Fetch team members for assignee lookup
  const teamMembers = await convex.query(api.teamMembers.list, { activeOnly: false });
  const memberByName = new Map<string, string>();
  for (const m of teamMembers) {
    memberByName.set(m.name.toLowerCase().trim(), m._id);
  }
  log(`Loaded ${teamMembers.length} team members for assignee lookup`);

  // If client map is empty (running tickets phase alone), try to build it from existing clients
  if (clientIdMap.size === 0) {
    log("Client ID map empty, loading from CSV + existing clients...");
    const clientRows = parseCSV(CLIENTS_CSV);
    const existingClients = await convex.query(api.clients.list, { includeInactive: true });
    for (const row of clientRows) {
      const taskId = row["Task ID"]?.trim();
      const name = row["Task Name"]?.trim();
      if (taskId && name) {
        const existing = existingClients.find(
          (c: any) => c.name.toLowerCase().trim() === name.toLowerCase().trim()
        );
        if (existing) {
          clientIdMap.set(taskId, existing._id);
        }
      }
    }
    log(`Rebuilt client ID map with ${clientIdMap.size} entries`);
  }

  let created = 0;
  let errors = 0;

  for (const row of targetRows) {
    const title = row["Task Name"]?.trim();
    if (!title) continue;

    const statusRaw = row["Status"]?.trim().toLowerCase();
    const status = STATUS_MAP[statusRaw] || "needs_attention";
    const priorityRaw = row["Priority"]?.trim();
    const priority = PRIORITY_MAP[priorityRaw] || "normal";

    const description = row["Task Content"]?.trim() || "";
    const dueDate = parseClickUpDate(row["Due Date"] || "");
    const startDate = parseClickUpDate(row["Start Date"] || "");

    // Parse assignees
    const assigneeNames = parseBracketedList(row["Assignee"] || "");
    const assigneeIds: string[] = [];
    for (const name of assigneeNames) {
      const id = memberByName.get(name.toLowerCase().trim());
      if (id) {
        assigneeIds.push(id);
      } else {
        log(`  WARNING: No team member found for "${name}"`);
      }
    }

    // Parse client reference
    const clientRefRaw = row["Client (list relationship)"]?.trim() || "";
    const clientRefs = parseBracketedList(clientRefRaw);
    let clientId: string | undefined;
    for (const ref of clientRefs) {
      const mapped = clientIdMap.get(ref);
      if (mapped) {
        clientId = mapped;
        break;
      }
    }

    const latestComment = row["Latest Comment"]?.trim() || "";

    if (DRY_RUN) {
      log(`  DRY RUN: Would create ticket "${title}" [${status}] ${assigneeNames.length ? `assigned to ${assigneeNames.join(", ")}` : ""} ${clientId ? "(linked to client)" : ""}`);
      created++;
      continue;
    }

    try {
      const ticketResult = await convex.mutation(api.tickets.create, {
        title,
        description,
        descriptionFormat: "plain",
        status,
        priority,
        dueDate,
        startDate,
        clientId: clientId as any,
        assigneeIds: assigneeIds as any[],
      });

      // If there's a latest comment, add it
      if (latestComment && ticketResult?._id) {
        try {
          await convex.mutation(api.ticketComments.create, {
            ticketId: ticketResult._id,
            authorName: "ClickUp Import",
            content: latestComment,
          });
        } catch (commentErr) {
          log(`  WARNING: Failed to add comment to "${title}": ${commentErr}`);
        }
      }

      created++;
      log(`  CREATED: ${title} [${status}]`);
    } catch (err) {
      log(`  ERROR creating "${title}": ${err}`);
      errors++;
    }
  }

  log(`Tickets done: ${created} created, ${errors} errors`);
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 3: Migrate Leads
// ────────────────────────────────────────────────────────────────────────────

const LEAD_STATUS_MAP: Record<string, string> = {
  "initial email sent": "contacted",
  new: "new",
  contacted: "contacted",
  responded: "responded",
  "meeting scheduled": "meeting_scheduled",
  "proposal sent": "proposal_sent",
  won: "won",
  lost: "lost",
};

async function migrateLeads() {
  log("=== Phase 3: Migrating Leads ===");

  const rows = parseCSV(LEADS_CSV);
  log(`Parsed ${rows.length} lead rows from CSV`);

  let created = 0;

  for (const row of rows) {
    const company = row["Task Name"]?.trim();
    if (!company) continue;

    // Parse "Todd - CEO" -> contactName: "Todd", contactRole: "CEO"
    const personRaw = row["Person (short text)"]?.trim() || "";
    let contactName = personRaw;
    let contactRole = "";
    const dashIdx = personRaw.indexOf(" - ");
    if (dashIdx > 0) {
      contactName = personRaw.substring(0, dashIdx).trim();
      contactRole = personRaw.substring(dashIdx + 3).trim();
    }

    const contactEmail = row["Email (email)"]?.trim() || "";
    const website = row["URL (url)"]?.trim() || "";

    const statusRaw = row["Status (drop down)"]?.trim().toLowerCase() || "";
    const status = LEAD_STATUS_MAP[statusRaw] || "new";

    if (DRY_RUN) {
      log(`  DRY RUN: Would create lead "${company}" (${contactName}, ${contactRole})`);
      created++;
      continue;
    }

    try {
      await convex.mutation(api.leads.create, {
        company,
        contactName: contactName || undefined,
        contactRole: contactRole || undefined,
        contactEmail: contactEmail || undefined,
        website: website || undefined,
        status,
        source: "ClickUp Import",
      });
      created++;
      log(`  CREATED: ${company}`);
    } catch (err) {
      log(`  ERROR creating "${company}": ${err}`);
    }
  }

  log(`Leads done: ${created} created`);
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  log(`Migration starting... ${DRY_RUN ? "(DRY RUN)" : ""}`);
  log(`Phase: ${PHASE}`);

  if (PHASE === "all" || PHASE === "clients") {
    await migrateClients();
  }

  if (PHASE === "all" || PHASE === "tickets") {
    await migrateTickets();
  }

  if (PHASE === "all" || PHASE === "leads") {
    await migrateLeads();
  }

  log("Migration complete!");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
