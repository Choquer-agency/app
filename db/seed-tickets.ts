/**
 * Seed script: Inserts 15 test tickets with assignees, comments, time entries, and subtasks.
 * Run: npx tsx db/seed-tickets.ts
 */

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load env vars from .env.local
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  const val = trimmed.slice(eqIdx + 1);
  if (!process.env[key]) process.env[key] = val;
}

const DATABASE_URL = process.env.POSTGRES_URL_NO_SSL || process.env.POSTGRES_URL || "";
if (!DATABASE_URL) {
  console.error("No POSTGRES_URL found in .env.local");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// Helper to generate ticket number from sequence
async function nextTicketNumber(): Promise<string> {
  const rows = await sql`SELECT nextval('ticket_number_seq') AS num`;
  return `CHQ-${String(rows[0].num).padStart(3, "0")}`;
}

// Helper for dates relative to today
function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function hoursAgo(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

function daysAgoAt(days: number, hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

async function seed() {
  console.log("Fetching team members and clients...");

  const teamMembers = await sql`SELECT id, name, email FROM team_members WHERE active = true ORDER BY id`;
  const clients = await sql`SELECT id, name FROM clients WHERE active = true ORDER BY id LIMIT 10`;

  if (teamMembers.length === 0) {
    console.error("No active team members found. Please add team members first.");
    process.exit(1);
  }

  console.log(`Found ${teamMembers.length} team members:`, teamMembers.map((m) => m.name));
  console.log(`Found ${clients.length} clients:`, clients.map((c) => c.name));

  // Use first few team members (cycle if less than needed)
  const tm = (i: number) => teamMembers[i % teamMembers.length];
  const cl = (i: number) => (clients.length > 0 ? clients[i % clients.length] : null);

  // ──────────────────────────────────────────────────────────────────────────
  // TICKETS
  // ──────────────────────────────────────────────────────────────────────────

  interface TicketDef {
    title: string;
    description: string;
    status: string;
    priority: string;
    dueDate: string | null;
    startDate: string | null;
    clientIdx: number | null;
    createdByIdx: number;
    assigneeIdxs: number[];
    ticketGroup: string;
  }

  const ticketDefs: TicketDef[] = [
    {
      title: "Homepage redesign — full layout overhaul",
      description: "Complete redesign of the homepage including hero section, service cards, testimonials, and CTA sections. Must be mobile-first and match new brand guidelines. Reference Figma: homepage-v3.",
      status: "in_progress",
      priority: "high",
      dueDate: daysFromNow(-3), // past due
      startDate: daysFromNow(-14),
      clientIdx: 0,
      createdByIdx: 0,
      assigneeIdxs: [0, 1],
      ticketGroup: "Design",
    },
    {
      title: "Fix mobile navigation dropdown not closing on tap",
      description: "On iOS Safari, the mobile hamburger menu doesn't close when tapping outside. Reproducible on iPhone 15 Pro. The overlay click handler seems to not fire on touch events.",
      status: "stuck",
      priority: "urgent",
      dueDate: daysFromNow(-5), // past due
      startDate: daysFromNow(-7),
      clientIdx: 0,
      createdByIdx: 0,
      assigneeIdxs: [1],
      ticketGroup: "Bug Fix",
    },
    {
      title: "SEO audit Q1 — technical + content review",
      description: "Full technical SEO audit covering: Core Web Vitals, crawl errors, broken links, duplicate content, schema markup gaps, and keyword cannibalization analysis. Deliver as PDF + Loom walkthrough.",
      status: "qa_ready",
      priority: "normal",
      dueDate: daysFromNow(5), // upcoming
      startDate: daysFromNow(-10),
      clientIdx: 1,
      createdByIdx: 0,
      assigneeIdxs: [0, 2 % teamMembers.length],
      ticketGroup: "SEO",
    },
    {
      title: "Google Ads campaign setup — lead gen funnel",
      description: "Set up new Google Ads search campaign for lead generation. Create 3 ad groups, write ad copy, set up conversion tracking, and configure target CPA bidding. Budget: $3,000/month.",
      status: "needs_attention",
      priority: "high",
      dueDate: daysFromNow(0), // today
      startDate: daysFromNow(-2),
      clientIdx: 2 % (clients.length || 1),
      createdByIdx: 0,
      assigneeIdxs: [1],
      ticketGroup: "Paid Ads",
    },
    {
      title: "Blog post: AI trends reshaping digital marketing in 2026",
      description: "Write a 1,500-word blog post covering AI trends in digital marketing. Topics: AI-generated content, predictive analytics, chatbots, personalized ads. Include 3 case studies and custom graphics.",
      status: "client_review",
      priority: "normal",
      dueDate: daysFromNow(7), // upcoming
      startDate: daysFromNow(-5),
      clientIdx: 1,
      createdByIdx: 1 % teamMembers.length,
      assigneeIdxs: [1 % teamMembers.length],
      ticketGroup: "Content",
    },
    {
      title: "Monthly analytics report — February 2026",
      description: "Generate monthly analytics report covering GA4 traffic, GSC impressions/clicks, Google Ads ROAS, and social media engagement. Highlight MoM trends and provide 3 actionable recommendations.",
      status: "approved_go_live",
      priority: "low",
      dueDate: daysFromNow(-10), // past (completed)
      startDate: daysFromNow(-15),
      clientIdx: 0,
      createdByIdx: 0,
      assigneeIdxs: [2 % teamMembers.length],
      ticketGroup: "Reporting",
    },
    {
      title: "Social media content calendar — March 2026",
      description: "Plan and schedule 20 social media posts across Instagram, LinkedIn, and Facebook. Include carousel designs, caption copy, hashtag research, and optimal posting times.",
      status: "in_progress",
      priority: "normal",
      dueDate: daysFromNow(10), // upcoming
      startDate: daysFromNow(-3),
      clientIdx: 3 % (clients.length || 1),
      createdByIdx: 1 % teamMembers.length,
      assigneeIdxs: [0, 1 % teamMembers.length],
      ticketGroup: "Social Media",
    },
    {
      title: "Email template design — welcome series",
      description: "Design 3-email welcome drip sequence: welcome + brand intro, service overview, CTA to book a call. Must pass Litmus rendering tests on Outlook, Gmail, and Apple Mail.",
      status: "closed",
      priority: "normal",
      dueDate: daysFromNow(-20), // past (closed)
      startDate: daysFromNow(-30),
      clientIdx: 2 % (clients.length || 1),
      createdByIdx: 0,
      assigneeIdxs: [0],
      ticketGroup: "Email",
    },
    {
      title: "Site speed optimization — sub-3s LCP target",
      description: "Optimize site performance to achieve LCP under 3 seconds. Tasks: image compression, lazy loading, code splitting, reduce third-party scripts, implement CDN caching, and defer non-critical JS.",
      status: "in_progress",
      priority: "high",
      dueDate: null, // no due date
      startDate: daysFromNow(-7),
      clientIdx: 0,
      createdByIdx: 0,
      assigneeIdxs: [1 % teamMembers.length],
      ticketGroup: "Development",
    },
    {
      title: "Client onboarding documentation update",
      description: "Update the client onboarding checklist and process documentation. Add sections for: access provisioning, analytics setup, brand asset collection, and kickoff meeting agenda template.",
      status: "needs_attention",
      priority: "normal",
      dueDate: daysFromNow(14), // upcoming
      startDate: null,
      clientIdx: null, // internal
      createdByIdx: 0,
      assigneeIdxs: [2 % teamMembers.length],
      ticketGroup: "Internal",
    },
    {
      title: "Update privacy policy for CCPA compliance",
      description: "Review and update privacy policy to ensure CCPA compliance. Add data deletion request process, update cookie consent language, and add California-specific disclosures.",
      status: "needs_attention",
      priority: "low",
      dueDate: null, // no due date
      startDate: null,
      clientIdx: null, // internal
      createdByIdx: 0,
      assigneeIdxs: [0],
      ticketGroup: "Legal",
    },
    {
      title: "CRO — landing page A/B test setup",
      description: "Set up A/B test on main service landing page. Variant A: current layout. Variant B: new hero with video, social proof above fold, simplified form. Use Google Optimize. Run for 4 weeks minimum.",
      status: "qa_ready",
      priority: "high",
      dueDate: daysFromNow(3), // upcoming
      startDate: daysFromNow(-5),
      clientIdx: 1,
      createdByIdx: 1 % teamMembers.length,
      assigneeIdxs: [0, 1 % teamMembers.length],
      ticketGroup: "CRO",
    },
    {
      title: "Backlink outreach campaign — 20 targets",
      description: "Execute link building outreach campaign. Identify 20 high-DA prospects, craft personalized emails, and track responses. Target: 5 acquired backlinks with DA 40+.",
      status: "in_progress",
      priority: "normal",
      dueDate: daysFromNow(-1), // past due (yesterday)
      startDate: daysFromNow(-12),
      clientIdx: 1,
      createdByIdx: 0,
      assigneeIdxs: [2 % teamMembers.length],
      ticketGroup: "SEO",
    },
    {
      title: "Server migration planning — AWS to Vercel",
      description: "Plan migration from AWS EC2 to Vercel for the client's Next.js app. Document: current architecture, migration steps, DNS changes, rollback plan, and estimated downtime. Coordinate with client's IT team.",
      status: "stuck",
      priority: "urgent",
      dueDate: daysFromNow(7), // upcoming
      startDate: daysFromNow(-3),
      clientIdx: 3 % (clients.length || 1),
      createdByIdx: 0,
      assigneeIdxs: [0, 1 % teamMembers.length],
      ticketGroup: "Development",
    },
    {
      title: "Quarterly business review — Q1 2026 prep",
      description: "Prepare QBR presentation for client: performance dashboard screenshots, ROI analysis, goal progress tracking, next quarter strategy proposal, and budget recommendations.",
      status: "client_review",
      priority: "high",
      dueDate: daysFromNow(4), // upcoming
      startDate: daysFromNow(-2),
      clientIdx: 0,
      createdByIdx: 0,
      assigneeIdxs: [0],
      ticketGroup: "Reporting",
    },
  ];

  console.log("\nCreating 15 tickets...");
  const ticketIds: number[] = [];

  for (let i = 0; i < ticketDefs.length; i++) {
    const def = ticketDefs[i];
    const ticketNumber = await nextTicketNumber();
    const createdBy = tm(def.createdByIdx);
    const client = def.clientIdx !== null ? cl(def.clientIdx) : null;
    const closedAt = def.status === "closed" ? daysAgoAt(18, 16, 30) : null;

    const rows = await sql`
      INSERT INTO tickets (
        ticket_number, title, description, description_format,
        client_id, status, priority, ticket_group,
        start_date, due_date, sort_order, created_by_id,
        archived, closed_at
      ) VALUES (
        ${ticketNumber}, ${def.title}, ${def.description}, 'plain',
        ${client?.id ?? null}, ${def.status}, ${def.priority}, ${def.ticketGroup},
        ${def.startDate}, ${def.dueDate}, ${i}, ${createdBy.id},
        false, ${closedAt}
      ) RETURNING id
    `;

    const ticketId = rows[0].id as number;
    ticketIds.push(ticketId);

    // Add assignees
    for (const aIdx of def.assigneeIdxs) {
      const member = tm(aIdx);
      await sql`
        INSERT INTO ticket_assignees (ticket_id, team_member_id)
        VALUES (${ticketId}, ${member.id})
        ON CONFLICT (ticket_id, team_member_id) DO NOTHING
      `;
    }

    // Log creation activity
    await sql`
      INSERT INTO ticket_activity (ticket_id, actor_id, actor_name, action_type, metadata)
      VALUES (${ticketId}, ${createdBy.id}, ${createdBy.name}, 'created', ${JSON.stringify({ ticketNumber })})
    `;

    console.log(`  ${ticketNumber} — ${def.title} [${def.status}/${def.priority}]`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SUBTASKS (for tickets 0, 2, 8 — Homepage, SEO Audit, Site Speed)
  // ──────────────────────────────────────────────────────────────────────────

  console.log("\nCreating subtasks...");

  const subtaskDefs = [
    // Subtasks for ticket 0 (Homepage redesign)
    { parentIdx: 0, title: "Design hero section mockup", status: "approved_go_live", priority: "high", assigneeIdx: 1 },
    { parentIdx: 0, title: "Build responsive service cards component", status: "in_progress", priority: "normal", assigneeIdx: 0 },

    // Subtasks for ticket 2 (SEO Audit)
    { parentIdx: 2, title: "Run Screaming Frog crawl + export", status: "closed", priority: "normal", assigneeIdx: 2 % teamMembers.length },
    { parentIdx: 2, title: "Core Web Vitals analysis per page", status: "qa_ready", priority: "high", assigneeIdx: 0 },
    { parentIdx: 2, title: "Keyword cannibalization report", status: "in_progress", priority: "normal", assigneeIdx: 2 % teamMembers.length },

    // Subtasks for ticket 8 (Site speed)
    { parentIdx: 8, title: "Compress and convert images to WebP", status: "closed", priority: "high", assigneeIdx: 1 % teamMembers.length },
    { parentIdx: 8, title: "Implement lazy loading for below-fold content", status: "in_progress", priority: "normal", assigneeIdx: 1 % teamMembers.length },
  ];

  const subtaskIds: number[] = [];
  for (const sub of subtaskDefs) {
    const ticketNumber = await nextTicketNumber();
    const parentId = ticketIds[sub.parentIdx];
    const member = tm(sub.assigneeIdx);
    const creator = tm(0);
    const closedAt = sub.status === "closed" ? daysAgoAt(2, 14, 0) : null;

    const rows = await sql`
      INSERT INTO tickets (
        ticket_number, title, description, description_format,
        parent_ticket_id, status, priority, sort_order,
        created_by_id, archived, closed_at
      ) VALUES (
        ${ticketNumber}, ${sub.title}, '', 'plain',
        ${parentId}, ${sub.status}, ${sub.priority}, 0,
        ${creator.id}, false, ${closedAt}
      ) RETURNING id
    `;

    const subId = rows[0].id as number;
    subtaskIds.push(subId);

    await sql`
      INSERT INTO ticket_assignees (ticket_id, team_member_id)
      VALUES (${subId}, ${member.id})
      ON CONFLICT (ticket_id, team_member_id) DO NOTHING
    `;

    await sql`
      INSERT INTO ticket_activity (ticket_id, actor_id, actor_name, action_type, metadata)
      VALUES (${subId}, ${creator.id}, ${creator.name}, 'created', ${JSON.stringify({ ticketNumber })})
    `;

    console.log(`  ${ticketNumber} — ${sub.title} (subtask of ticket #${sub.parentIdx + 1})`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TIME ENTRIES — ~10 tickets with varied durations
  // ──────────────────────────────────────────────────────────────────────────

  console.log("\nAdding time entries...");

  interface TimeEntryDef {
    ticketIdx: number;
    memberIdx: number;
    daysAgo: number;
    startHour: number;
    durationMin: number;
    note: string;
  }

  const timeEntryDefs: TimeEntryDef[] = [
    // Ticket 0 — Homepage redesign (multiple sessions)
    { ticketIdx: 0, memberIdx: 0, daysAgo: 10, startHour: 9, durationMin: 180, note: "Initial wireframing and layout exploration" },
    { ticketIdx: 0, memberIdx: 1, daysAgo: 8, startHour: 10, durationMin: 120, note: "Hero section design in Figma" },
    { ticketIdx: 0, memberIdx: 0, daysAgo: 5, startHour: 14, durationMin: 90, note: "Service cards component build" },
    { ticketIdx: 0, memberIdx: 1, daysAgo: 2, startHour: 11, durationMin: 60, note: "Responsive breakpoint adjustments" },

    // Ticket 1 — Mobile nav bug
    { ticketIdx: 1, memberIdx: 1, daysAgo: 4, startHour: 15, durationMin: 45, note: "Debugging iOS Safari touch events" },
    { ticketIdx: 1, memberIdx: 1, daysAgo: 3, startHour: 9, durationMin: 30, note: "Tested fix on BrowserStack, still flaky" },

    // Ticket 2 — SEO audit
    { ticketIdx: 2, memberIdx: 0, daysAgo: 7, startHour: 10, durationMin: 240, note: "Screaming Frog crawl + data analysis" },
    { ticketIdx: 2, memberIdx: 2 % teamMembers.length, daysAgo: 5, startHour: 13, durationMin: 150, note: "Core Web Vitals deep dive and per-page audit" },

    // Ticket 4 — Blog post
    { ticketIdx: 4, memberIdx: 1 % teamMembers.length, daysAgo: 3, startHour: 9, durationMin: 120, note: "Research and outline draft" },
    { ticketIdx: 4, memberIdx: 1 % teamMembers.length, daysAgo: 1, startHour: 10, durationMin: 180, note: "Full draft writing + graphic requests" },

    // Ticket 5 — Monthly report
    { ticketIdx: 5, memberIdx: 2 % teamMembers.length, daysAgo: 12, startHour: 10, durationMin: 90, note: "Data pull from GA4, GSC, and Ads" },
    { ticketIdx: 5, memberIdx: 2 % teamMembers.length, daysAgo: 11, startHour: 14, durationMin: 60, note: "Report formatting and recommendations" },

    // Ticket 6 — Social media calendar
    { ticketIdx: 6, memberIdx: 1 % teamMembers.length, daysAgo: 2, startHour: 9, durationMin: 150, note: "Hashtag research and content ideation" },
    { ticketIdx: 6, memberIdx: 0, daysAgo: 1, startHour: 15, durationMin: 60, note: "Carousel design templates" },

    // Ticket 7 — Email templates (closed)
    { ticketIdx: 7, memberIdx: 0, daysAgo: 25, startHour: 10, durationMin: 180, note: "Email template design in Figma" },
    { ticketIdx: 7, memberIdx: 0, daysAgo: 22, startHour: 11, durationMin: 120, note: "HTML/CSS coding and Litmus testing" },

    // Ticket 8 — Site speed
    { ticketIdx: 8, memberIdx: 1 % teamMembers.length, daysAgo: 5, startHour: 14, durationMin: 90, note: "Image audit and WebP conversion" },
    { ticketIdx: 8, memberIdx: 1 % teamMembers.length, daysAgo: 1, startHour: 10, durationMin: 120, note: "Lazy loading implementation" },

    // Ticket 11 — CRO landing page
    { ticketIdx: 11, memberIdx: 0, daysAgo: 3, startHour: 10, durationMin: 90, note: "Variant B mockup design" },
    { ticketIdx: 11, memberIdx: 1 % teamMembers.length, daysAgo: 2, startHour: 14, durationMin: 60, note: "Google Optimize experiment setup" },

    // Ticket 12 — Backlink outreach
    { ticketIdx: 12, memberIdx: 2 % teamMembers.length, daysAgo: 8, startHour: 9, durationMin: 120, note: "Prospect list research and vetting" },
    { ticketIdx: 12, memberIdx: 2 % teamMembers.length, daysAgo: 4, startHour: 10, durationMin: 90, note: "Personalized outreach email drafting" },

    // Ticket 14 — QBR prep
    { ticketIdx: 14, memberIdx: 0, daysAgo: 1, startHour: 9, durationMin: 150, note: "Dashboard screenshots and ROI calculations" },
  ];

  for (const entry of timeEntryDefs) {
    const member = tm(entry.memberIdx);
    const ticketId = ticketIds[entry.ticketIdx];
    const startTime = daysAgoAt(entry.daysAgo, entry.startHour, 0);
    const endTime = daysAgoAt(entry.daysAgo, entry.startHour, entry.durationMin);
    // Fix: endTime should be startHour + duration
    const endDate = new Date(startTime);
    endDate.setMinutes(endDate.getMinutes() + entry.durationMin);
    const endTimeStr = endDate.toISOString();
    const durationSeconds = entry.durationMin * 60;

    await sql`
      INSERT INTO time_entries (ticket_id, team_member_id, start_time, end_time, duration_seconds, is_manual, note)
      VALUES (${ticketId}, ${member.id}, ${startTime}, ${endTimeStr}, ${durationSeconds}, true, ${entry.note})
    `;
  }
  console.log(`  Added ${timeEntryDefs.length} time entries`);

  // ──────────────────────────────────────────────────────────────────────────
  // COMMENTS
  // ──────────────────────────────────────────────────────────────────────────

  console.log("\nAdding comments...");

  interface CommentDef {
    ticketIdx: number;
    authorType: string;
    authorIdx: number;
    content: string;
    daysAgo: number;
  }

  const commentDefs: CommentDef[] = [
    // Ticket 0 — Homepage redesign (3 comments)
    { ticketIdx: 0, authorType: "team", authorIdx: 0, content: "Started the wireframe. Going with a modular grid system so we can easily swap sections. Should have the first draft by end of week.", daysAgo: 12 },
    { ticketIdx: 0, authorType: "team", authorIdx: 1, content: "Hero section mockup is done — uploaded to Figma. Let me know if the gradient direction works or if we should try the solid background option.", daysAgo: 8 },
    { ticketIdx: 0, authorType: "client", authorIdx: 0, content: "Love the hero direction! Can we try a version with the team photo instead of the abstract graphic? Also, the CTA button color might need to be bolder.", daysAgo: 6 },

    // Ticket 1 — Mobile nav bug (2 comments)
    { ticketIdx: 1, authorType: "team", authorIdx: 1, content: "Tracked it down to the overlay div not receiving touchend events on iOS Safari 17. The `pointer-events` CSS property is being overridden by the animation library.", daysAgo: 4 },
    { ticketIdx: 1, authorType: "team", authorIdx: 0, content: "Have you tried using `ontouchstart` as a fallback? We had a similar issue on another project — the fix was adding `cursor: pointer` to the overlay on iOS.", daysAgo: 3 },

    // Ticket 2 — SEO audit (1 comment)
    { ticketIdx: 2, authorType: "team", authorIdx: 2 % teamMembers.length, content: "Crawl complete — found 23 broken internal links and 8 pages with duplicate title tags. Core Web Vitals look good overall except /services page (LCP: 4.2s). Moving to QA.", daysAgo: 3 },

    // Ticket 4 — Blog post (2 comments)
    { ticketIdx: 4, authorType: "team", authorIdx: 1 % teamMembers.length, content: "Draft is ready for client review. Word count: 1,650. Added 3 case studies as discussed. Custom graphics request sent to design.", daysAgo: 1 },
    { ticketIdx: 4, authorType: "client", authorIdx: 0, content: "Great article! Two small notes: (1) Can we add a mention of our AI chatbot product in the intro? (2) The second case study needs the company name anonymized.", daysAgo: 0 },

    // Ticket 5 — Monthly report (1 comment)
    { ticketIdx: 5, authorType: "team", authorIdx: 2 % teamMembers.length, content: "Report finalized. Key highlights: organic traffic up 18% MoM, Google Ads ROAS improved from 3.2x to 4.1x, and social engagement doubled. Client loved it.", daysAgo: 10 },

    // Ticket 6 — Social media calendar (3 comments)
    { ticketIdx: 6, authorType: "team", authorIdx: 1 % teamMembers.length, content: "Content plan drafted: 8 carousel posts, 5 static posts, 4 stories, 3 reels. Split across IG (12), LinkedIn (5), FB (3). Ready for review.", daysAgo: 2 },
    { ticketIdx: 6, authorType: "team", authorIdx: 0, content: "Carousel templates look clean. Just a heads up — the client mentioned they want to feature their new office in at least 2 posts. Can we swap out the stock photos?", daysAgo: 1 },
    { ticketIdx: 6, authorType: "client", authorIdx: 0, content: "Yes please use our new office photos! I'll upload them to the shared drive today. Also can we add one more LinkedIn post about our hiring?", daysAgo: 0 },

    // Ticket 7 — Email templates (2 comments)
    { ticketIdx: 7, authorType: "team", authorIdx: 0, content: "All 3 templates designed and coded. Passed Litmus tests on Outlook 2019+, Gmail (web + mobile), and Apple Mail. Open rate optimization: subject lines A/B tested.", daysAgo: 20 },
    { ticketIdx: 7, authorType: "client", authorIdx: 0, content: "These look perfect! Approved for go-live. Please set up the automation trigger in Mailchimp when ready.", daysAgo: 19 },

    // Ticket 9 — Onboarding docs (1 comment)
    { ticketIdx: 9, authorType: "team", authorIdx: 0, content: "Created the initial outline with 4 sections. Need input from the team on the analytics setup checklist — what tools are we standardizing on now?", daysAgo: 1 },

    // Ticket 11 — CRO test (2 comments)
    { ticketIdx: 11, authorType: "team", authorIdx: 0, content: "Variant B mockup ready. Key changes: video hero (15s loop), trust badges above fold, form reduced from 6 to 3 fields. Expect 15-20% lift based on similar tests.", daysAgo: 3 },
    { ticketIdx: 11, authorType: "team", authorIdx: 1 % teamMembers.length, content: "Google Optimize experiment is configured. Traffic split: 50/50. Minimum runtime: 4 weeks or 1,000 conversions, whichever comes first. Ready to launch on approval.", daysAgo: 1 },

    // Ticket 12 — Backlink outreach (1 comment)
    { ticketIdx: 12, authorType: "team", authorIdx: 2 % teamMembers.length, content: "Sent outreach to first batch of 10 prospects. Average DA: 52. Got 3 responses so far — 1 confirmed placement, 1 requesting a guest post, 1 asking for more info.", daysAgo: 2 },

    // Ticket 13 — Server migration (3 comments)
    { ticketIdx: 13, authorType: "team", authorIdx: 0, content: "Mapped out current AWS architecture: 2 EC2 instances, RDS PostgreSQL, S3 for assets, CloudFront CDN. The Next.js app can go directly to Vercel, but we need a plan for the database.", daysAgo: 2 },
    { ticketIdx: 13, authorType: "team", authorIdx: 1 % teamMembers.length, content: "Blocker: the client's IT team hasn't provided DNS access yet. I've followed up twice. Without it we can't plan the cutover window. Marking as stuck.", daysAgo: 1 },
    { ticketIdx: 13, authorType: "client", authorIdx: 0, content: "Sorry for the delay on DNS access — our IT director was on PTO. He's back Monday and will send credentials. Can we schedule the migration for the following weekend?", daysAgo: 0 },

    // Ticket 14 — QBR prep (1 comment)
    { ticketIdx: 14, authorType: "team", authorIdx: 0, content: "QBR deck is 80% done. Sections complete: performance metrics, ROI analysis, campaign summaries. Still need: next quarter strategy slides and budget projections. Will finish tomorrow.", daysAgo: 0 },
  ];

  for (const c of commentDefs) {
    const ticketId = ticketIds[c.ticketIdx];
    let authorName: string;
    let authorEmail: string;
    let authorId: number | null;

    if (c.authorType === "team") {
      const member = tm(c.authorIdx);
      authorName = member.name;
      authorEmail = member.email;
      authorId = member.id;
    } else {
      // For client comments, use a generic client contact name
      const client = cl(c.ticketIdx < ticketDefs.length ? (ticketDefs[c.ticketIdx].clientIdx ?? 0) : 0);
      authorName = client ? `${client.name} (Client)` : "Client Contact";
      authorEmail = "client@example.com";
      authorId = null;
    }

    const createdAt = daysAgoAt(c.daysAgo, 10 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60));

    await sql`
      INSERT INTO ticket_comments (ticket_id, author_type, author_id, author_name, author_email, content, created_at, updated_at)
      VALUES (${ticketId}, ${c.authorType}, ${authorId}, ${authorName}, ${authorEmail}, ${c.content}, ${createdAt}, ${createdAt})
    `;
  }
  console.log(`  Added ${commentDefs.length} comments`);

  // ──────────────────────────────────────────────────────────────────────────
  // ACTIVITY LOG — add status changes and other activities for realism
  // ──────────────────────────────────────────────────────────────────────────

  console.log("\nAdding activity entries...");

  interface ActivityDef {
    ticketIdx: number;
    actorIdx: number;
    actionType: string;
    fieldName?: string;
    oldValue?: string;
    newValue?: string;
    daysAgo: number;
  }

  const activityDefs: ActivityDef[] = [
    // Ticket 0 — status progression
    { ticketIdx: 0, actorIdx: 0, actionType: "status_change", fieldName: "status", oldValue: "needs_attention", newValue: "in_progress", daysAgo: 12 },

    // Ticket 1 — status changes
    { ticketIdx: 1, actorIdx: 1, actionType: "status_change", fieldName: "status", oldValue: "needs_attention", newValue: "in_progress", daysAgo: 6 },
    { ticketIdx: 1, actorIdx: 1, actionType: "status_change", fieldName: "status", oldValue: "in_progress", newValue: "stuck", daysAgo: 3 },
    { ticketIdx: 1, actorIdx: 0, actionType: "priority_change", fieldName: "priority", oldValue: "high", newValue: "urgent", daysAgo: 3 },

    // Ticket 2 — status progression
    { ticketIdx: 2, actorIdx: 0, actionType: "status_change", fieldName: "status", oldValue: "needs_attention", newValue: "in_progress", daysAgo: 8 },
    { ticketIdx: 2, actorIdx: 2 % teamMembers.length, actionType: "status_change", fieldName: "status", oldValue: "in_progress", newValue: "qa_ready", daysAgo: 3 },

    // Ticket 4 — to client review
    { ticketIdx: 4, actorIdx: 1 % teamMembers.length, actionType: "status_change", fieldName: "status", oldValue: "in_progress", newValue: "client_review", daysAgo: 1 },

    // Ticket 5 — full lifecycle
    { ticketIdx: 5, actorIdx: 2 % teamMembers.length, actionType: "status_change", fieldName: "status", oldValue: "needs_attention", newValue: "in_progress", daysAgo: 13 },
    { ticketIdx: 5, actorIdx: 2 % teamMembers.length, actionType: "status_change", fieldName: "status", oldValue: "in_progress", newValue: "client_review", daysAgo: 11 },
    { ticketIdx: 5, actorIdx: 0, actionType: "status_change", fieldName: "status", oldValue: "client_review", newValue: "approved_go_live", daysAgo: 10 },

    // Ticket 7 — closed lifecycle
    { ticketIdx: 7, actorIdx: 0, actionType: "status_change", fieldName: "status", oldValue: "needs_attention", newValue: "in_progress", daysAgo: 28 },
    { ticketIdx: 7, actorIdx: 0, actionType: "status_change", fieldName: "status", oldValue: "in_progress", newValue: "client_review", daysAgo: 21 },
    { ticketIdx: 7, actorIdx: 0, actionType: "status_change", fieldName: "status", oldValue: "client_review", newValue: "approved_go_live", daysAgo: 19 },
    { ticketIdx: 7, actorIdx: 0, actionType: "status_change", fieldName: "status", oldValue: "approved_go_live", newValue: "closed", daysAgo: 18 },

    // Ticket 13 — stuck
    { ticketIdx: 13, actorIdx: 1 % teamMembers.length, actionType: "status_change", fieldName: "status", oldValue: "needs_attention", newValue: "in_progress", daysAgo: 2 },
    { ticketIdx: 13, actorIdx: 1 % teamMembers.length, actionType: "status_change", fieldName: "status", oldValue: "in_progress", newValue: "stuck", daysAgo: 1 },
  ];

  for (const act of activityDefs) {
    const actor = tm(act.actorIdx);
    const ticketId = ticketIds[act.ticketIdx];
    const createdAt = daysAgoAt(act.daysAgo, 10 + Math.floor(Math.random() * 6), 0);

    await sql`
      INSERT INTO ticket_activity (ticket_id, actor_id, actor_name, action_type, field_name, old_value, new_value, created_at)
      VALUES (${ticketId}, ${actor.id}, ${actor.name}, ${act.actionType}, ${act.fieldName ?? null}, ${act.oldValue ?? null}, ${act.newValue ?? null}, ${createdAt})
    `;
  }
  console.log(`  Added ${activityDefs.length} activity entries`);

  // ──────────────────────────────────────────────────────────────────────────
  // DONE
  // ──────────────────────────────────────────────────────────────────────────

  console.log("\n✅ Seed complete!");
  console.log(`   ${ticketIds.length} tickets`);
  console.log(`   ${subtaskIds.length} subtasks`);
  console.log(`   ${timeEntryDefs.length} time entries`);
  console.log(`   ${commentDefs.length} comments`);
  console.log(`   ${activityDefs.length} activity log entries`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
