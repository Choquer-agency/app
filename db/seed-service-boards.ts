// Run with: npx tsx db/seed-service-boards.ts
import { sql } from "@vercel/postgres";

async function seed() {
  console.log("Connected to database");

  // 1. Run migration 025
  console.log("\n--- Running migration 025 ---");
  await sql`
    CREATE TABLE IF NOT EXISTS service_board_entries (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      client_package_id INTEGER NOT NULL REFERENCES client_packages(id) ON DELETE CASCADE,
      category VARCHAR(30) NOT NULL,
      month DATE NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'needs_attention',
      specialist_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
      monthly_email_sent_at TIMESTAMPTZ,
      quarterly_email_sent_at TIMESTAMPTZ,
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(client_package_id, month)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_sbe_client ON service_board_entries(client_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sbe_category ON service_board_entries(category)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sbe_month ON service_board_entries(month)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sbe_status ON service_board_entries(status)`;
  await sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS service_category VARCHAR(30)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tickets_service_category ON tickets(service_category)`;
  await sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'`;
  console.log("Migration 025 complete");

  // 2. Find Bryce's team member ID
  const { rows: bryceRows } = await sql`
    SELECT id, name FROM team_members WHERE LOWER(email) = 'bryce@choquer.agency' LIMIT 1
  `;
  if (bryceRows.length === 0) {
    console.error("Could not find Bryce in team_members!");
    process.exit(1);
  }
  const bryceId = bryceRows[0].id as number;
  console.log(`\nBryce's team member ID: ${bryceId}`);

  // Tag Bryce with SEO and Google Ads
  await sql`UPDATE team_members SET tags = '{"SEO","Google Ads"}' WHERE id = ${bryceId}`;
  console.log("Tagged Bryce with SEO and Google Ads");

  // 3. Get package IDs
  const { rows: packages } = await sql`
    SELECT id, name, category FROM packages WHERE category IN ('seo', 'google_ads', 'retainer') AND active = true
  `;
  console.log("\nAvailable packages:", packages.map((p) => `${p.name} (${p.category})`));

  const seoPackage = packages.find((p) => p.category === "seo");
  const adsPackage = packages.find((p) => p.category === "google_ads");
  const retainerPackage = packages.find((p) => p.category === "retainer");

  if (!seoPackage || !adsPackage || !retainerPackage) {
    console.error("Missing required packages! Run the main migration first.");
    process.exit(1);
  }

  // 4. Create test clients
  const testClients = [
    { name: "Maple Leaf Plumbing", slug: "maple-leaf-plumbing", category: "seo" },
    { name: "Northern Lights Dental", slug: "northern-lights-dental", category: "seo" },
    { name: "Summit Construction", slug: "summit-construction", category: "seo" },
    { name: "Cascade Coffee Roasters", slug: "cascade-coffee", category: "seo" },
    { name: "Prairie Wind Farms", slug: "prairie-wind-farms", category: "seo" },
    { name: "Urban Fit Gym", slug: "urban-fit-gym", category: "google_ads" },
    { name: "Lakeside Auto Group", slug: "lakeside-auto", category: "google_ads" },
    { name: "Peak Performance Physio", slug: "peak-performance", category: "google_ads" },
    { name: "Horizon Real Estate Group", slug: "horizon-real-estate", category: "retainer" },
    { name: "Blue Ocean Logistics", slug: "blue-ocean-logistics", category: "retainer" },
  ];

  const clientIds: Record<string, { id: number; category: string; name: string }> = {};

  for (const tc of testClients) {
    const { rows: existing } = await sql`SELECT id FROM clients WHERE slug = ${tc.slug} LIMIT 1`;

    let clientId: number;
    if (existing.length > 0) {
      clientId = existing[0].id as number;
      console.log(`Client "${tc.name}" already exists (ID: ${clientId})`);
    } else {
      const { rows: inserted } = await sql`
        INSERT INTO clients (name, slug, active, ga4_property_id, gsc_site_url, se_rankings_project_id, cal_link, notion_page_url, client_status)
        VALUES (${tc.name}, ${tc.slug}, true, '', '', '', '', '', 'active')
        RETURNING id
      `;
      clientId = inserted[0].id as number;
      console.log(`Created client "${tc.name}" (ID: ${clientId})`);
    }
    clientIds[tc.slug] = { id: clientId, category: tc.category, name: tc.name };
  }

  // 5. Assign packages
  for (const tc of testClients) {
    const cid = clientIds[tc.slug].id;
    const pkgId =
      tc.category === "seo" ? seoPackage.id : tc.category === "google_ads" ? adsPackage.id : retainerPackage.id;

    const { rows: existingAssign } = await sql`
      SELECT id FROM client_packages WHERE client_id = ${cid} AND package_id = ${pkgId} AND active = true LIMIT 1
    `;

    if (existingAssign.length === 0) {
      await sql`
        INSERT INTO client_packages (client_id, package_id, active, signup_date)
        VALUES (${cid}, ${pkgId}, true, CURRENT_DATE)
      `;
      console.log(`Assigned ${tc.category} package to "${tc.name}"`);
    } else {
      console.log(`Package already assigned to "${tc.name}"`);
    }
  }

  // 6. Now force-create service board entries for this month with Bryce as specialist
  // and varied statuses so the UI has something to show
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const statusCycle = ["needs_attention", "in_progress", "report_ready", "email_sent", "in_progress"];
  let statusIdx = 0;

  for (const tc of testClients) {
    const cid = clientIds[tc.slug].id;
    const pkgId =
      tc.category === "seo"
        ? (seoPackage.id as number)
        : tc.category === "google_ads"
        ? (adsPackage.id as number)
        : (retainerPackage.id as number);

    // Get the client_package ID
    const { rows: cpRows } = await sql`
      SELECT id FROM client_packages WHERE client_id = ${cid} AND package_id = ${pkgId} AND active = true LIMIT 1
    `;
    if (cpRows.length === 0) continue;
    const cpId = cpRows[0].id as number;

    const status = statusCycle[statusIdx % statusCycle.length];
    statusIdx++;

    // Upsert service board entry
    const { rows: existingEntry } = await sql`
      SELECT id FROM service_board_entries WHERE client_package_id = ${cpId} AND month = ${month}::date LIMIT 1
    `;

    if (existingEntry.length === 0) {
      await sql`
        INSERT INTO service_board_entries (client_id, client_package_id, category, month, status, specialist_id)
        VALUES (${cid}, ${cpId}, ${tc.category}, ${month}::date, ${status}, ${bryceId})
      `;
      console.log(`Created service board entry for "${tc.name}" (${status})`);
    } else {
      await sql`
        UPDATE service_board_entries SET specialist_id = ${bryceId}, status = ${status} WHERE id = ${existingEntry[0].id}
      `;
      console.log(`Updated service board entry for "${tc.name}" (${status})`);
    }

    // Mark the email_sent ones with a timestamp
    if (status === "email_sent") {
      await sql`
        UPDATE service_board_entries SET monthly_email_sent_at = NOW()
        WHERE client_package_id = ${cpId} AND month = ${month}::date
      `;
    }
  }

  // 7. Create retainer tickets
  const retainerTicketDefs: Record<string, Array<{ title: string; status: string }>> = {
    "horizon-real-estate": [
      { title: "Homepage hero section redesign", status: "in_progress" },
      { title: "Blog post: Spring market update", status: "qa_ready" },
      { title: "Social media graphics - March", status: "closed" },
      { title: "Email newsletter template", status: "needs_attention" },
    ],
    "blue-ocean-logistics": [
      { title: "Shipping rates page update", status: "in_progress" },
      { title: "New carrier integration landing page", status: "needs_attention" },
      { title: "Monthly analytics report", status: "closed" },
    ],
  };

  for (const [slug, tickets] of Object.entries(retainerTicketDefs)) {
    const cid = clientIds[slug].id;

    for (const ticket of tickets) {
      const { rows: existingTicket } = await sql`
        SELECT id FROM tickets WHERE title = ${ticket.title} AND client_id = ${cid} AND service_category = 'retainer' LIMIT 1
      `;

      if (existingTicket.length === 0) {
        const { rows: seqRows } = await sql`SELECT nextval('ticket_number_seq') AS num`;
        const ticketNumber = `CHQ-${String(seqRows[0].num).padStart(3, "0")}`;

        await sql`
          INSERT INTO tickets (ticket_number, title, client_id, status, priority, service_category, created_by_id)
          VALUES (${ticketNumber}, ${ticket.title}, ${cid}, ${ticket.status}, 'normal', 'retainer', ${bryceId})
        `;
        console.log(`Created retainer ticket "${ticket.title}" for ${clientIds[slug].name}`);
      } else {
        console.log(`Retainer ticket "${ticket.title}" already exists`);
      }
    }
  }

  console.log("\n--- Seed complete! ---");
  console.log("\nVisit:");
  console.log("  /admin/tickets/seo         — 5 SEO clients");
  console.log("  /admin/tickets/google-ads   — 3 Google Ads clients");
  console.log("  /admin/tickets/retainer     — 2 Retainer clients with sub-tickets");
  console.log("  /admin/tickets/my-board     — Summary banner at top");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
