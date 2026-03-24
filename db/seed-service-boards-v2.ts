// Run with: POSTGRES_URL="..." npx tsx db/seed-service-boards-v2.ts
import { sql } from "@vercel/postgres";

// Clients that are NEW in March — should NOT have February data
const MARCH_ONLY_CLIENTS = ["Cascade Coffee Roasters", "Peak Performance Physio"];

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Pick a random date within a month (year-month as '2026-02-01') and return a start/end TIMESTAMPTZ pair */
function randomTimeEntry(monthStr: string, durationHours: number): { start: string; end: string; seconds: number } {
  const base = new Date(monthStr + "T09:00:00-07:00"); // PST-ish
  const day = randInt(1, 27); // keep within month bounds
  base.setDate(day);
  const hour = randInt(8, 16);
  base.setHours(hour, randInt(0, 59), 0, 0);
  const startMs = base.getTime();
  const seconds = Math.round(durationHours * 3600);
  const endMs = startMs + seconds * 1000;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    seconds,
  };
}

async function seed() {
  console.log("=== Service Boards V2 Seed: Feb data + March time entries ===\n");

  // 1. Get Bryce's team member ID
  const { rows: bryceRows } = await sql`
    SELECT id, name FROM team_members WHERE LOWER(email) = 'bryce@choquer.agency' LIMIT 1
  `;
  if (bryceRows.length === 0) {
    console.error("Could not find Bryce (bryce@choquer.agency) in team_members!");
    process.exit(1);
  }
  const bryceId = bryceRows[0].id as number;
  console.log(`Bryce's ID: ${bryceId} (${bryceRows[0].name})\n`);

  // 2. Get all existing March 2026 service_board_entries
  const { rows: marchEntries } = await sql`
    SELECT sbe.id, sbe.client_id, sbe.client_package_id, sbe.category, sbe.status,
           c.name AS client_name, cp.package_id
    FROM service_board_entries sbe
    JOIN clients c ON c.id = sbe.client_id
    JOIN client_packages cp ON cp.id = sbe.client_package_id
    WHERE sbe.month = '2026-03-01'
    ORDER BY sbe.category, c.name
  `;

  console.log(`Found ${marchEntries.length} March 2026 service board entries:\n`);
  for (const e of marchEntries) {
    console.log(`  [${e.category}] ${e.client_name} — status: ${e.status}`);
  }

  // ──────────────────────────────────────────────
  // 3. For each March entry, create a service ticket + random time entry
  // ──────────────────────────────────────────────
  console.log("\n--- Creating March service tickets + time entries ---\n");

  // Budget patterns: some under, some over, some close
  const budgetPatterns = [
    { hours: 3, label: "under budget (3h)" },
    { hours: 7, label: "over budget (7h)" },
    { hours: 5.5, label: "close to budget (5.5h)" },
    { hours: 2, label: "well under (2h)" },
    { hours: 8, label: "over budget (8h)" },
    { hours: 4, label: "under budget (4h)" },
    { hours: 6.5, label: "slightly over (6.5h)" },
    { hours: 1.5, label: "minimal (1.5h)" },
    { hours: 9, label: "way over (9h)" },
    { hours: 3.5, label: "under budget (3.5h)" },
  ];

  const marchNotes: Record<string, string[]> = {
    seo: [
      "Keyword research and content optimization",
      "Backlink audit and outreach",
      "Technical SEO audit",
      "Content brief writing",
      "On-page optimization",
    ],
    google_ads: [
      "Campaign structure review",
      "Ad copy A/B testing setup",
      "Negative keyword cleanup",
      "Bid strategy adjustment",
      "Landing page optimization",
    ],
    retainer: [
      "Design revision round",
      "Content updates and publishing",
      "Monthly maintenance tasks",
      "Client call prep and follow-up",
    ],
  };

  for (let i = 0; i < marchEntries.length; i++) {
    const entry = marchEntries[i];
    const pattern = budgetPatterns[i % budgetPatterns.length];
    const category = entry.category as string;
    const notes = marchNotes[category] || marchNotes.seo;
    const note = notes[randInt(0, notes.length - 1)];

    // Find or create a service ticket for this client/category in March
    const ticketTitle = `${category.toUpperCase().replace("_", " ")} — March 2026 — ${entry.client_name}`;
    const { rows: existingTicket } = await sql`
      SELECT id FROM tickets
      WHERE client_id = ${entry.client_id}
        AND service_category = ${category}
        AND title = ${ticketTitle}
      LIMIT 1
    `;

    let ticketId: number;
    if (existingTicket.length > 0) {
      ticketId = existingTicket[0].id as number;
      console.log(`  Ticket already exists: "${ticketTitle}" (ID: ${ticketId})`);
    } else {
      const { rows: seqRows } = await sql`SELECT nextval('ticket_number_seq') AS num`;
      const ticketNumber = `CHQ-${String(seqRows[0].num).padStart(3, "0")}`;
      const { rows: inserted } = await sql`
        INSERT INTO tickets (ticket_number, title, client_id, status, priority, service_category, created_by_id, start_date)
        VALUES (${ticketNumber}, ${ticketTitle}, ${entry.client_id}, 'in_progress', 'normal', ${category}, ${bryceId}, '2026-03-01')
        RETURNING id
      `;
      ticketId = inserted[0].id as number;
      console.log(`  Created ticket ${ticketNumber}: "${ticketTitle}"`);
    }

    // Add a time entry (manual) for March
    const te = randomTimeEntry("2026-03-01", pattern.hours);
    await sql`
      INSERT INTO time_entries (ticket_id, team_member_id, start_time, end_time, duration_seconds, is_manual, note)
      VALUES (${ticketId}, ${bryceId}, ${te.start}::timestamptz, ${te.end}::timestamptz, ${te.seconds}, true, ${note})
    `;
    console.log(`    + Time entry: ${pattern.label} — "${note}"`);
  }

  // ──────────────────────────────────────────────
  // 4. Create February 2026 data (exclude March-only clients)
  // ──────────────────────────────────────────────
  console.log("\n--- Creating February 2026 data ---\n");

  const febMonth = "2026-02-01";
  const febEmailSentAt = "2026-02-25T10:00:00-07:00";

  // Filter out March-only clients
  const febEntries = marchEntries.filter(
    (e) => !MARCH_ONLY_CLIENTS.includes(e.client_name as string)
  );

  console.log(`Creating Feb entries for ${febEntries.length} clients (excluding ${MARCH_ONLY_CLIENTS.join(", ")})\n`);

  const febBudgetPatterns = [
    { hours: 4.5, label: "4.5h" },
    { hours: 2.5, label: "2.5h" },
    { hours: 3, label: "3h" },
    { hours: 5, label: "5h" },
    { hours: 3.5, label: "3.5h" },
    { hours: 2, label: "2h" },
    { hours: 4, label: "4h" },
    { hours: 3.2, label: "3.2h" },
  ];

  const febNotes: Record<string, string[]> = {
    seo: [
      "February keyword ranking review",
      "Content calendar planning",
      "Link building outreach",
    ],
    google_ads: [
      "Monthly campaign performance review",
      "Budget reallocation",
      "Quality score improvements",
    ],
    retainer: [
      "February maintenance and updates",
      "Design asset creation",
      "Monthly report compilation",
    ],
  };

  for (let i = 0; i < febEntries.length; i++) {
    const entry = febEntries[i];
    const category = entry.category as string;
    const clientId = entry.client_id as number;
    const cpId = entry.client_package_id as number;
    const pattern = febBudgetPatterns[i % febBudgetPatterns.length];
    const notes = febNotes[category] || febNotes.seo;
    const note = notes[randInt(0, notes.length - 1)];

    // Create Feb service_board_entry (all 'email_sent' since Feb is complete)
    const { rows: existingFebEntry } = await sql`
      SELECT id FROM service_board_entries WHERE client_package_id = ${cpId} AND month = ${febMonth}::date LIMIT 1
    `;

    if (existingFebEntry.length === 0) {
      await sql`
        INSERT INTO service_board_entries (client_id, client_package_id, category, month, status, specialist_id, monthly_email_sent_at)
        VALUES (${clientId}, ${cpId}, ${category}, ${febMonth}::date, 'email_sent', ${bryceId}, ${febEmailSentAt}::timestamptz)
      `;
      console.log(`  Created Feb entry: [${category}] ${entry.client_name} — email_sent`);
    } else {
      console.log(`  Feb entry already exists: [${category}] ${entry.client_name}`);
    }

    // Create a service ticket for Feb
    const febTicketTitle = `${category.toUpperCase().replace("_", " ")} — February 2026 — ${entry.client_name}`;
    const { rows: existingFebTicket } = await sql`
      SELECT id FROM tickets
      WHERE client_id = ${clientId}
        AND service_category = ${category}
        AND title = ${febTicketTitle}
      LIMIT 1
    `;

    let febTicketId: number;
    if (existingFebTicket.length > 0) {
      febTicketId = existingFebTicket[0].id as number;
      console.log(`    Ticket exists: "${febTicketTitle}"`);
    } else {
      const { rows: seqRows } = await sql`SELECT nextval('ticket_number_seq') AS num`;
      const ticketNumber = `CHQ-${String(seqRows[0].num).padStart(3, "0")}`;
      await sql`
        INSERT INTO tickets (ticket_number, title, client_id, status, priority, service_category, created_by_id, start_date, closed_at)
        VALUES (${ticketNumber}, ${febTicketTitle}, ${clientId}, 'closed', 'normal', ${category}, ${bryceId}, '2026-02-01', '2026-02-28T17:00:00-07:00'::timestamptz)
      `;
      const { rows: inserted } = await sql`
        SELECT id FROM tickets WHERE ticket_number = ${ticketNumber} LIMIT 1
      `;
      febTicketId = inserted[0].id as number;
      console.log(`    Created ticket ${ticketNumber}: "${febTicketTitle}" (closed)`);
    }

    // Add completed time entry for Feb
    const te = randomTimeEntry("2026-02-01", pattern.hours);
    await sql`
      INSERT INTO time_entries (ticket_id, team_member_id, start_time, end_time, duration_seconds, is_manual, note)
      VALUES (${febTicketId}, ${bryceId}, ${te.start}::timestamptz, ${te.end}::timestamptz, ${te.seconds}, true, ${note})
    `;
    console.log(`    + Time entry: ${pattern.label} — "${note}"`);
  }

  // ──────────────────────────────────────────────
  // 5. Extra retainer tickets for Feb (closed)
  // ──────────────────────────────────────────────
  console.log("\n--- Creating extra February retainer tickets ---\n");

  // Find retainer clients in Feb entries
  const febRetainerEntries = febEntries.filter((e) => e.category === "retainer");

  const febRetainerTickets: Record<string, Array<{ title: string }>> = {
    "Horizon Real Estate Group": [
      { title: "February blog post: Winter market trends" },
      { title: "Social media graphics - February" },
    ],
    "Blue Ocean Logistics": [
      { title: "February fleet tracking page updates" },
      { title: "Partner portal bug fixes" },
    ],
  };

  for (const retainerEntry of febRetainerEntries) {
    const clientName = retainerEntry.client_name as string;
    const clientId = retainerEntry.client_id as number;
    const extraTickets = febRetainerTickets[clientName];
    if (!extraTickets) continue;

    for (const t of extraTickets) {
      const { rows: existing } = await sql`
        SELECT id FROM tickets WHERE title = ${t.title} AND client_id = ${clientId} AND service_category = 'retainer' LIMIT 1
      `;

      let tid: number;
      if (existing.length > 0) {
        tid = existing[0].id as number;
        console.log(`  Retainer ticket exists: "${t.title}"`);
      } else {
        const { rows: seqRows } = await sql`SELECT nextval('ticket_number_seq') AS num`;
        const ticketNumber = `CHQ-${String(seqRows[0].num).padStart(3, "0")}`;
        const { rows: inserted } = await sql`
          INSERT INTO tickets (ticket_number, title, client_id, status, priority, service_category, created_by_id, start_date, closed_at)
          VALUES (${ticketNumber}, ${t.title}, ${clientId}, 'closed', 'normal', 'retainer', ${bryceId}, '2026-02-01', '2026-02-27T15:00:00-07:00'::timestamptz)
          RETURNING id
        `;
        tid = inserted[0].id as number;
        console.log(`  Created retainer ticket ${ticketNumber}: "${t.title}" (closed)`);
      }

      // Add time entry
      const hours = randInt(1, 3) + Math.random();
      const te = randomTimeEntry("2026-02-01", parseFloat(hours.toFixed(1)));
      await sql`
        INSERT INTO time_entries (ticket_id, team_member_id, start_time, end_time, duration_seconds, is_manual, note)
        VALUES (${tid}, ${bryceId}, ${te.start}::timestamptz, ${te.end}::timestamptz, ${te.seconds}, true, 'February retainer work')
      `;
      console.log(`    + Time entry: ${hours.toFixed(1)}h`);
    }
  }

  console.log("\n=== Seed V2 complete! ===");
  console.log("\nSummary:");
  console.log(`  - March time entries added for ${marchEntries.length} clients (mix of under/over budget)`);
  console.log(`  - February entries created for ${febEntries.length} clients (all email_sent/closed)`);
  console.log(`  - ${MARCH_ONLY_CLIENTS.join(", ")} have NO February data (new in March)`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
