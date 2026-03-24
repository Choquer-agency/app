import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
const envVars = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim();
}

const client = new pg.Client({ connectionString: envVars.POSTGRES_URL || envVars.DATABASE_URL });

async function seed() {
  await client.connect();
  console.log("Connected to database");

  // 1. Run migration 025
  console.log("\n--- Running migration 025 ---");
  await client.query(`
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
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_sbe_client ON service_board_entries(client_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_sbe_category ON service_board_entries(category)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_sbe_month ON service_board_entries(month)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_sbe_status ON service_board_entries(status)`);
  await client.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS service_category VARCHAR(30)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_service_category ON tickets(service_category)`);
  await client.query(`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'`);
  console.log("Migration 025 complete");

  // 2. Find Bryce's team member ID
  const { rows: bryceRows } = await client.query(
    `SELECT id, name FROM team_members WHERE LOWER(email) = 'bryce@choquer.agency' LIMIT 1`
  );
  if (bryceRows.length === 0) {
    console.error("Could not find Bryce in team_members!");
    process.exit(1);
  }
  const bryceId = bryceRows[0].id;
  console.log(`\nBryce's team member ID: ${bryceId}`);

  // Tag Bryce with SEO and Google Ads
  await client.query(`UPDATE team_members SET tags = '{"SEO","Google Ads"}' WHERE id = $1`, [bryceId]);
  console.log("Tagged Bryce with SEO and Google Ads");

  // 3. Get SEO, Google Ads, and Retainer package IDs
  const { rows: packages } = await client.query(`SELECT id, name, category FROM packages WHERE category IN ('seo', 'google_ads', 'retainer') AND active = true`);
  console.log("\nAvailable packages:", packages.map(p => `${p.name} (${p.category})`));

  const seoPackage = packages.find(p => p.category === "seo");
  const adsPackage = packages.find(p => p.category === "google_ads");
  const retainerPackage = packages.find(p => p.category === "retainer");

  if (!seoPackage || !adsPackage || !retainerPackage) {
    console.error("Missing required packages! Run the main migration first.");
    process.exit(1);
  }

  // 4. Create test clients (if they don't exist)
  const testClients = [
    // SEO clients
    { name: "Maple Leaf Plumbing", slug: "maple-leaf-plumbing", category: "seo" },
    { name: "Northern Lights Dental", slug: "northern-lights-dental", category: "seo" },
    { name: "Summit Construction", slug: "summit-construction", category: "seo" },
    { name: "Cascade Coffee Roasters", slug: "cascade-coffee", category: "seo" },
    { name: "Prairie Wind Farms", slug: "prairie-wind-farms", category: "seo" },
    // Google Ads clients
    { name: "Urban Fit Gym", slug: "urban-fit-gym", category: "google_ads" },
    { name: "Lakeside Auto Group", slug: "lakeside-auto", category: "google_ads" },
    { name: "Peak Performance Physio", slug: "peak-performance", category: "google_ads" },
    // Retainer clients
    { name: "Horizon Real Estate Group", slug: "horizon-real-estate", category: "retainer" },
    { name: "Blue Ocean Logistics", slug: "blue-ocean-logistics", category: "retainer" },
  ];

  const clientIds = {};

  for (const tc of testClients) {
    // Check if client exists
    const { rows: existing } = await client.query(
      `SELECT id FROM clients WHERE slug = $1 LIMIT 1`, [tc.slug]
    );

    let clientId;
    if (existing.length > 0) {
      clientId = existing[0].id;
      console.log(`Client "${tc.name}" already exists (ID: ${clientId})`);
    } else {
      const { rows: inserted } = await client.query(
        `INSERT INTO clients (name, slug, active, ga4_property_id, gsc_site_url, se_rankings_project_id, cal_link, notion_page_url, client_status)
         VALUES ($1, $2, true, '', '', '', '', '', 'active')
         RETURNING id`,
        [tc.name, tc.slug]
      );
      clientId = inserted[0].id;
      console.log(`Created client "${tc.name}" (ID: ${clientId})`);
    }
    clientIds[tc.slug] = { id: clientId, category: tc.category, name: tc.name };
  }

  // 5. Assign packages to clients
  for (const tc of testClients) {
    const cid = clientIds[tc.slug].id;
    let pkgId;
    if (tc.category === "seo") pkgId = seoPackage.id;
    else if (tc.category === "google_ads") pkgId = adsPackage.id;
    else pkgId = retainerPackage.id;

    // Check if assignment exists
    const { rows: existingAssign } = await client.query(
      `SELECT id FROM client_packages WHERE client_id = $1 AND package_id = $2 AND active = true LIMIT 1`,
      [cid, pkgId]
    );

    if (existingAssign.length === 0) {
      await client.query(
        `INSERT INTO client_packages (client_id, package_id, active, signup_date)
         VALUES ($1, $2, true, CURRENT_DATE)`,
        [cid, pkgId]
      );
      console.log(`Assigned ${tc.category} package to "${tc.name}"`);
    } else {
      console.log(`Package already assigned to "${tc.name}"`);
    }
  }

  // 6. Create some retainer tickets for the retainer clients
  const retainerClients = testClients.filter(tc => tc.category === "retainer");
  for (const tc of retainerClients) {
    const cid = clientIds[tc.slug].id;

    const retainerTickets = tc.slug === "horizon-real-estate"
      ? [
          { title: "Homepage hero section redesign", status: "in_progress" },
          { title: "Blog post: Spring market update", status: "qa_ready" },
          { title: "Social media graphics - March", status: "closed" },
          { title: "Email newsletter template", status: "needs_attention" },
        ]
      : [
          { title: "Shipping rates page update", status: "in_progress" },
          { title: "New carrier integration landing page", status: "needs_attention" },
          { title: "Monthly analytics report", status: "closed" },
        ];

    for (const ticket of retainerTickets) {
      // Check if ticket exists
      const { rows: existingTicket } = await client.query(
        `SELECT id FROM tickets WHERE title = $1 AND client_id = $2 AND service_category = 'retainer' LIMIT 1`,
        [ticket.title, cid]
      );

      if (existingTicket.length === 0) {
        const { rows: seqRows } = await client.query(`SELECT nextval('ticket_number_seq') AS num`);
        const ticketNumber = `CHQ-${String(seqRows[0].num).padStart(3, "0")}`;

        await client.query(
          `INSERT INTO tickets (ticket_number, title, client_id, status, priority, service_category, created_by_id)
           VALUES ($1, $2, $3, $4, 'normal', 'retainer', $5)`,
          [ticketNumber, ticket.title, cid, ticket.status, bryceId]
        );
        console.log(`Created retainer ticket "${ticket.title}" for ${tc.name}`);
      } else {
        console.log(`Retainer ticket "${ticket.title}" already exists`);
      }
    }
  }

  // 7. Set varied statuses for SEO/Ads entries (will be created lazily, but let's prep some)
  // The service board entries will be auto-created when the board is viewed
  // We just need the packages assigned (done above) and Bryce set as specialist (done by the lazy creation)

  console.log("\n--- Seed complete! ---");
  console.log("Next steps:");
  console.log("1. Visit /admin/tickets/seo to see the SEO board");
  console.log("2. Visit /admin/tickets/google-ads to see the Google Ads board");
  console.log("3. Visit /admin/tickets/retainer to see the Retainer board");
  console.log("4. Visit /admin/tickets/my-board to see the summary banner");
  console.log("\nNote: Service board entries are created lazily when you first view a board.");
  console.log("After viewing, update specialists via the board UI.");

  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
