import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getSession } from "@/lib/admin-auth";
import { backfillApprovalHashes } from "@/lib/db";

export async function POST(request: NextRequest) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: string[] = [];

  try {
    // Migration 001: Expand clients table with CRM fields
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS website_url VARCHAR(500) DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_name VARCHAR(200) DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255) DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50) DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_start_date DATE`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_end_date DATE`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS mrr NUMERIC(10,2) DEFAULT 0`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS country VARCHAR(2) DEFAULT 'CA'`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS seo_hours_allocated NUMERIC(5,1) DEFAULT 0`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS account_specialist VARCHAR(200) DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255) DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255) DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS city VARCHAR(100) DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS province_state VARCHAR(100) DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20) DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_status VARCHAR(20) DEFAULT 'active'`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS offboarding_date DATE`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS industry VARCHAR(100) DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_contact_date TIMESTAMPTZ`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS next_review_date DATE`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_linkedin VARCHAR(500) DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_facebook VARCHAR(500) DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_instagram VARCHAR(500) DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_x VARCHAR(500) DEFAULT ''`;
    await sql`CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(client_status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_clients_country ON clients(country)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_clients_specialist ON clients(account_specialist)`;
    results.push("001: clients CRM columns — OK");

    // Migration 002: Packages table
    await sql`
      CREATE TABLE IF NOT EXISTS packages (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT DEFAULT '',
        default_price NUMERIC(10,2) NOT NULL DEFAULT 0,
        included_services TEXT[] DEFAULT '{}',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_packages_active ON packages(active)`;
    results.push("002: packages table — OK");

    // Migration 003: Client-package assignments
    await sql`
      CREATE TABLE IF NOT EXISTS client_packages (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
        custom_price NUMERIC(10,2),
        signup_date DATE NOT NULL DEFAULT CURRENT_DATE,
        contract_end_date DATE,
        active BOOLEAN DEFAULT true,
        notes TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    // Drop unique constraint if it exists (clients can have multiple of the same package)
    await sql`
      ALTER TABLE client_packages DROP CONSTRAINT IF EXISTS client_packages_client_id_package_id_key
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_client_packages_client ON client_packages(client_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_client_packages_package ON client_packages(package_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_client_packages_active ON client_packages(active)`;
    // Add missing columns from migration 002/003 (may already exist)
    await sql`ALTER TABLE packages ADD COLUMN IF NOT EXISTS category VARCHAR(30) DEFAULT 'other'`;
    await sql`ALTER TABLE packages ADD COLUMN IF NOT EXISTS billing_frequency VARCHAR(20) DEFAULT 'monthly'`;
    await sql`ALTER TABLE packages ADD COLUMN IF NOT EXISTS hours_included NUMERIC(5,1)`;
    await sql`ALTER TABLE packages ADD COLUMN IF NOT EXISTS setup_fee NUMERIC(10,2) DEFAULT 0`;
    await sql`ALTER TABLE client_packages ADD COLUMN IF NOT EXISTS custom_hours NUMERIC(5,1)`;
    await sql`ALTER TABLE client_packages ADD COLUMN IF NOT EXISTS apply_setup_fee BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE client_packages ADD COLUMN IF NOT EXISTS custom_setup_fee NUMERIC(10,2)`;
    results.push("003: client_packages table — OK");

    // Migration 003b: Seed packages from choquer.agency (skip any that already exist by name)
    let seededCount = 0;
    const seedPkgs: Array<{ name: string; description: string; price: number; category: string; hours: number | null; setupFee: number; services: string }> = [
      { name: 'Web Dev - Minimum', description: 'Webflow development for smaller projects', price: 4900, category: 'website', hours: null, setupFee: 0, services: '{"12-15 pages","1 Designer + 1 Developer","1 Dedicated Project Manager"}' },
      { name: 'Web Dev - Growth', description: 'Webflow development for growing businesses', price: 6900, category: 'website', hours: null, setupFee: 0, services: '{"20-30 pages","1 Designer + 2 Developers","1 Dedicated Project Manager"}' },
      { name: 'Web Dev - Corporate', description: 'Full-team Webflow development for enterprise', price: 10250, category: 'website', hours: null, setupFee: 0, services: '{"40+ pages","2 Designers + 2 Developers","1 Dedicated Project Manager","Direct team access communication"}' },
      { name: 'Retainer - 10 Hours', description: 'Monthly retainer with 10 hours of work', price: 2200, category: 'retainer', hours: 10, setupFee: 0, services: '{"UI/UX Design","Brand Development/Identity","Copywriting","SEO Strategy","Dedicated Slack Channel","Monthly Meetings"}' },
      { name: 'Retainer - 15 Hours', description: 'Monthly retainer with 15 hours of work', price: 3150, category: 'retainer', hours: 15, setupFee: 0, services: '{"UI/UX Design","Brand Development/Identity","Copywriting","SEO Strategy","Dedicated Slack Channel","Monthly Meetings"}' },
      { name: 'Retainer - 20 Hours', description: 'Monthly retainer with 20 hours of work', price: 4000, category: 'retainer', hours: 20, setupFee: 0, services: '{"UI/UX Design","Brand Development/Identity","Copywriting","SEO Strategy","Dedicated Slack Channel","Monthly Meetings"}' },
      { name: 'Retainer - 30 Hours', description: 'Monthly retainer with 30 hours (Most Popular)', price: 5700, category: 'retainer', hours: 30, setupFee: 0, services: '{"UI/UX Design","Brand Development/Identity","Copywriting","SEO Strategy","Dedicated Slack Channel","Monthly Meetings"}' },
      { name: 'Retainer - 40 Hours', description: 'Monthly retainer with 40 hours of work', price: 7200, category: 'retainer', hours: 40, setupFee: 0, services: '{"UI/UX Design","Brand Development/Identity","Copywriting","SEO Strategy","Dedicated Slack Channel","Monthly Meetings"}' },
      { name: 'Google Ads - Tier 1 ($500-$2,499 Ad Spend)', description: 'Google Ads management for $500-$2,499/mo ad spend', price: 625, category: 'google_ads', hours: null, setupFee: 2000, services: '{"Free $600 Ads Credit","Image Generation Assistance","Account Creation","Keyword Research","Ad Optimization"}' },
      { name: 'Google Ads - Tier 2 ($2,500-$4,499 Ad Spend)', description: 'Google Ads management for $2,500-$4,499/mo ad spend', price: 995, category: 'google_ads', hours: null, setupFee: 2000, services: '{"Free $600 Ads Credit","Image Generation Assistance","Account Creation","Keyword Research","Ad Optimization"}' },
      { name: 'Google Ads - Tier 3 ($4,500-$7,499 Ad Spend)', description: 'Google Ads management for $4,500-$7,499/mo ad spend', price: 1335, category: 'google_ads', hours: null, setupFee: 2000, services: '{"Free $600 Ads Credit","Image Generation Assistance","Account Creation","Keyword Research","Ad Optimization"}' },
      { name: 'Google Ads - Tier 4 ($7,500-$15,000 Ad Spend)', description: 'Google Ads management for $7,500-$15,000/mo ad spend (Most Popular)', price: 1695, category: 'google_ads', hours: null, setupFee: 2000, services: '{"Free $600 Ads Credit","Image Generation Assistance","Account Creation","Keyword Research","Ad Optimization"}' },
      { name: 'SEO - Starter', description: 'Entry-level organic SEO services', price: 2500, category: 'seo', hours: null, setupFee: 0, services: '{"1 Monthly Blog Post","1 Quarterly Landing Page","Basic Backlink & Citation Building","GBP Optimization","Quarterly Strategy Meeting","Quarterly Competitor Snapshot","Standard Keyword Reporting","48hr Email Support"}' },
      { name: 'SEO - Ranking Master', description: 'Mid-tier SEO with active link building', price: 3500, category: 'seo', hours: null, setupFee: 0, services: '{"2 Monthly Blog Posts","1 Quarterly Landing Page","Active Backlink & Citation Building (4-6 links/mo)","GBP Optimization & Weekly Posts","Monthly Strategy Meeting","Quarterly CRO Landing Page Audit","Monthly Competitor Snapshot","Standard Keyword Reporting","24hr Email Support"}' },
      { name: 'SEO - Corporate', description: 'Full-service SEO for maximum organic growth (Most Popular)', price: 6000, category: 'seo', hours: null, setupFee: 0, services: '{"4 Monthly Blog Posts","2-3 Monthly Landing Pages","Aggressive Backlink & Citation Building (8-12 links/mo)","GBP Optimization + Weekly Posts + Q&A Strategy","Monthly & On-Demand Strategy Meetings","Monthly CRO Recommendations","Weekly Competitor Snapshot","Full Custom Keyword Dashboard & Reporting","Slack & Email Same Day Response"}' },
      { name: 'AI Chatbot', description: 'Custom AI chatbot trained on your business content', price: 50, category: 'other', hours: null, setupFee: 500, services: '{"Ongoing Conversation Flow Monitoring","Escalation Path Review (Handoff to Human/CRM)","Monthly Performance Summary","Brand Voice & Tone Configuration","Custom Chatbot Trained on Your Business Content","Embedded Across All Pages of Website","CRM or Email System Integration"}' },
    ];
    for (const p of seedPkgs) {
      const exists = await sql`SELECT 1 FROM packages WHERE name = ${p.name} LIMIT 1`;
      if (exists.rows.length === 0) {
        await sql`INSERT INTO packages (name, description, default_price, category, billing_frequency, hours_included, setup_fee, included_services)
          VALUES (${p.name}, ${p.description}, ${p.price}, ${p.category}, 'monthly', ${p.hours}, ${p.setupFee}, ${p.services}::text[])`;
        seededCount++;
      }
    }
    results.push(`003b: seeded ${seededCount} new packages — OK`);

    // Migration 004: Client notes
    await sql`
      CREATE TABLE IF NOT EXISTS client_notes (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        author VARCHAR(200) NOT NULL DEFAULT 'Admin',
        note_type VARCHAR(30) NOT NULL DEFAULT 'note',
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_client_notes_client ON client_notes(client_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_client_notes_type ON client_notes(note_type)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_client_notes_created ON client_notes(created_at DESC)`;
    results.push("004: client_notes table — OK");

    // Migration 005: Team members
    await sql`
      CREATE TABLE IF NOT EXISTS team_members (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        role VARCHAR(100) DEFAULT '',
        cal_link VARCHAR(500) DEFAULT '',
        profile_pic_url VARCHAR(500) DEFAULT '',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS cal_link VARCHAR(500) DEFAULT ''`;
    await sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS profile_pic_url VARCHAR(500) DEFAULT ''`;
    results.push("005: team_members table — OK");

    // Migration 006: Approval content_hash for deduplication
    await sql`ALTER TABLE approvals ADD COLUMN IF NOT EXISTS content_hash VARCHAR(32)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_approvals_content_hash ON approvals(client_slug, content_hash)`;
    const backfilled = await backfillApprovalHashes();
    results.push(`006: approvals content_hash — OK (${backfilled} rows backfilled)`);

    // Migration 007: Team member authentication (individual passwords)
    await sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`;
    await sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS role_level VARCHAR(20) DEFAULT 'member'`;
    await sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ`;
    results.push("007: team auth columns — OK");

    // Migration 008: Tickets, ticket assignees, and saved views
    await sql`CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1`;
    await sql`
      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        ticket_number VARCHAR(20) NOT NULL UNIQUE,
        title VARCHAR(500) NOT NULL,
        description TEXT DEFAULT '',
        description_format VARCHAR(10) DEFAULT 'plain',
        client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
        project_id INTEGER,
        parent_ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'needs_attention',
        priority VARCHAR(10) NOT NULL DEFAULT 'normal',
        ticket_group VARCHAR(100) DEFAULT '',
        start_date DATE,
        due_date DATE,
        due_time TIME,
        sort_order INTEGER DEFAULT 0,
        created_by_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
        archived BOOLEAN DEFAULT false,
        closed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_tickets_client ON tickets(client_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tickets_parent ON tickets(parent_ticket_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tickets_due ON tickets(due_date)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tickets_archived ON tickets(archived)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tickets_number ON tickets(ticket_number)`;
    await sql`
      CREATE TABLE IF NOT EXISTS ticket_assignees (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(ticket_id, team_member_id)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_ticket_assignees_ticket ON ticket_assignees(ticket_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_ticket_assignees_member ON ticket_assignees(team_member_id)`;
    await sql`
      CREATE TABLE IF NOT EXISTS saved_views (
        id SERIAL PRIMARY KEY,
        team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        filters JSONB NOT NULL DEFAULT '{}',
        is_default BOOLEAN DEFAULT false,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_saved_views_member ON saved_views(team_member_id)`;
    results.push("008: tickets + assignees + saved_views — OK");

    // Migration 009: Ticket activity log
    await sql`
      CREATE TABLE IF NOT EXISTS ticket_activity (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        actor_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
        actor_name VARCHAR(200) NOT NULL DEFAULT '',
        action_type VARCHAR(50) NOT NULL,
        field_name VARCHAR(100),
        old_value TEXT,
        new_value TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_ticket_activity_ticket ON ticket_activity(ticket_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_ticket_activity_created ON ticket_activity(created_at DESC)`;
    results.push("009: ticket_activity — OK");

    // Migration 010: Time entries
    await sql`
      CREATE TABLE IF NOT EXISTS time_entries (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
        start_time TIMESTAMPTZ NOT NULL,
        end_time TIMESTAMPTZ,
        duration_seconds INTEGER,
        is_manual BOOLEAN DEFAULT false,
        note VARCHAR(500) DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_time_entries_ticket ON time_entries(ticket_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_time_entries_member ON time_entries(team_member_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_time_entries_start ON time_entries(start_time)`;
    results.push("010: time_entries — OK");

    // Migration 011: Ticket comments
    await sql`
      CREATE TABLE IF NOT EXISTS ticket_comments (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        author_type VARCHAR(10) NOT NULL DEFAULT 'team',
        author_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
        author_name VARCHAR(200) NOT NULL,
        author_email VARCHAR(255) DEFAULT '',
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id)`;
    results.push("011: ticket_comments — OK");

    // Migration 012: Ticket attachments
    await sql`
      CREATE TABLE IF NOT EXISTS ticket_attachments (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        uploaded_by_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
        file_name VARCHAR(500) NOT NULL,
        file_url VARCHAR(1000) NOT NULL,
        file_size INTEGER,
        file_type VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON ticket_attachments(ticket_id)`;
    results.push("012: ticket_attachments — OK");

    // Migration 013: Notifications
    await sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        recipient_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
        ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(300) NOT NULL,
        body VARCHAR(500) DEFAULT '',
        link VARCHAR(500) DEFAULT '',
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON notifications(recipient_id) WHERE is_read = false`;
    await sql`CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)`;
    results.push("013: notifications — OK");

    // Migration 014: Projects, templates & personal boards
    await sql`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(300) NOT NULL,
        description TEXT DEFAULT '',
        client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
        is_template BOOLEAN DEFAULT false,
        status VARCHAR(20) DEFAULT 'active',
        archived BOOLEAN DEFAULT false,
        start_date DATE,
        due_date DATE,
        created_by_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_projects_template ON projects(is_template)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(archived)`;

    // Add project FK on tickets (safe: column already exists, just adding constraint)
    try {
      await sql`ALTER TABLE tickets ADD CONSTRAINT fk_tickets_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL`;
    } catch {
      // Constraint may already exist
    }

    // Template day offsets
    await sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS day_offset_start INTEGER`;
    await sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS day_offset_due INTEGER`;

    // Personal board flag
    await sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS is_personal BOOLEAN DEFAULT false`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tickets_personal ON tickets(is_personal, created_by_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project_id)`;

    // Ticket dependencies
    await sql`
      CREATE TABLE IF NOT EXISTS ticket_dependencies (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        depends_on_ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        UNIQUE(ticket_id, depends_on_ticket_id)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_ticket_deps_ticket ON ticket_dependencies(ticket_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_ticket_deps_depends ON ticket_dependencies(depends_on_ticket_id)`;
    results.push("014: projects + templates + personal boards — OK");

    // Migration 015: Recurring tickets (already applied via 015_recurring.sql)
    // (table creation handled in prior migration runs)

    // Migration 016: Reports — available hours per week for utilization
    await sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS available_hours_per_week NUMERIC(4,1) DEFAULT 40`;
    results.push("016: reports — available_hours_per_week — OK");

    // Migration 017: Full-text search index for tickets
    await sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS search_vector tsvector`;
    await sql`
      UPDATE tickets SET search_vector =
        setweight(to_tsvector('english', coalesce(ticket_number, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
      WHERE search_vector IS NULL
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_tickets_search_vector ON tickets USING GIN(search_vector)`;
    // Create trigger function for auto-updating search_vector
    await sql`
      CREATE OR REPLACE FUNCTION tickets_search_vector_update() RETURNS trigger AS $$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector('english', coalesce(NEW.ticket_number, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `;
    await sql`DROP TRIGGER IF EXISTS tickets_search_vector_trigger ON tickets`;
    await sql`
      CREATE TRIGGER tickets_search_vector_trigger
        BEFORE INSERT OR UPDATE OF ticket_number, title, description
        ON tickets
        FOR EACH ROW
        EXECUTE FUNCTION tickets_search_vector_update()
    `;
    results.push("017: full-text search index — OK");

    // Migration 020: RBAC role hierarchy and team member wages
    // Map existing role_level values to new 5-tier system
    await sql`UPDATE team_members SET role_level = 'owner' WHERE LOWER(email) = 'bryce@choquer.agency' AND role_level IN ('admin', 'owner')`;
    await sql`UPDATE team_members SET role_level = 'employee' WHERE role_level = 'member'`;
    await sql`UPDATE team_members SET role_level = 'c_suite' WHERE role_level = 'admin'`;
    // Add wage fields
    await sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(8,2)`;
    await sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS salary NUMERIC(10,2)`;
    await sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS pay_type VARCHAR(10) DEFAULT 'hourly'`;
    results.push("020: RBAC roles + wage fields — OK");

    // Migration 022: Slack integration
    await sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS slack_user_id VARCHAR(50) DEFAULT ''`;
    await sql`
      CREATE TABLE IF NOT EXISTS slack_messages (
        id SERIAL PRIMARY KEY,
        team_member_id INTEGER NOT NULL REFERENCES team_members(id),
        message_type VARCHAR(50) NOT NULL,
        message_text TEXT NOT NULL,
        slack_ts VARCHAR(50) DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_slack_messages_member ON slack_messages(team_member_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_slack_messages_type ON slack_messages(message_type)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_slack_messages_created ON slack_messages(created_at DESC)`;
    // Seed Slack User IDs for known team members
    await sql`UPDATE team_members SET slack_user_id = 'U04NZ5R9Z6X' WHERE LOWER(name) LIKE '%andres%' AND slack_user_id = ''`;
    await sql`UPDATE team_members SET slack_user_id = 'U03CW6VBFEY' WHERE LOWER(name) LIKE '%johnny%' AND slack_user_id = ''`;
    await sql`UPDATE team_members SET slack_user_id = 'U053L4M1Z50' WHERE LOWER(name) LIKE '%kamal%' AND slack_user_id = ''`;
    await sql`UPDATE team_members SET slack_user_id = 'U08NYE41VP0' WHERE LOWER(name) LIKE '%lauren%' AND slack_user_id = ''`;
    await sql`UPDATE team_members SET slack_user_id = 'U02G9Q5VDRR' WHERE LOWER(email) = 'bryce@choquer.agency' AND slack_user_id = ''`;
    results.push("022: slack integration — OK");

    // Migration 023: Meeting notes
    await sql`
      CREATE TABLE IF NOT EXISTS meeting_notes (
        id SERIAL PRIMARY KEY,
        team_member_id INTEGER NOT NULL REFERENCES team_members(id),
        created_by_id INTEGER NOT NULL REFERENCES team_members(id),
        transcript TEXT NOT NULL,
        summary TEXT DEFAULT '',
        raw_extraction JSONB DEFAULT '[]',
        meeting_date DATE NOT NULL DEFAULT CURRENT_DATE,
        source VARCHAR(50) DEFAULT 'manual',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_meeting_notes_member ON meeting_notes(team_member_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_meeting_notes_date ON meeting_notes(meeting_date DESC)`;
    results.push("023: meeting_notes — OK");

    // Migration 024: Bulletin tables (personal notes + announcements)
    await sql`
      CREATE TABLE IF NOT EXISTS personal_notes (
        id SERIAL PRIMARY KEY,
        team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
        content TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(team_member_id)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        author_id INTEGER NOT NULL REFERENCES team_members(id),
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        pinned BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC)`;
    // Weekly quotes table
    await sql`
      CREATE TABLE IF NOT EXISTS weekly_quotes (
        id SERIAL PRIMARY KEY,
        quote TEXT NOT NULL,
        author VARCHAR(255) DEFAULT '',
        week_start DATE NOT NULL,
        selected BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_weekly_quotes_week ON weekly_quotes(week_start DESC)`;
    // Add source field to announcements for auto-generated vs manual
    await sql`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'manual'`;
    // Add type for categorized announcements (general, birthday, anniversary, time_off)
    await sql`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS announcement_type VARCHAR(30) DEFAULT 'general'`;
    // Add expires_at to announcements for smart auto-expiry
    await sql`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`;
    // Announcement reactions (emoji reactions like Slack)
    await sql`
      CREATE TABLE IF NOT EXISTS announcement_reactions (
        id SERIAL PRIMARY KEY,
        announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
        team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
        emoji VARCHAR(20) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(announcement_id, team_member_id, emoji)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_ann_reactions_ann ON announcement_reactions(announcement_id)`;
    await sql`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) DEFAULT ''`;
    // Calendar events (holidays, custom dates)
    await sql`
      CREATE TABLE IF NOT EXISTS calendar_events (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        event_date DATE NOT NULL,
        event_type VARCHAR(30) NOT NULL DEFAULT 'custom',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(event_date)`;
    await sql`ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS recurrence VARCHAR(20) DEFAULT 'none'`;
    results.push("024: bulletin tables (personal_notes, announcements, weekly_quotes, reactions, calendar) — OK");

    // Migration 025: Service boards (SEO, Google Ads, Retainer tracking)
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
    // Team member tags for board visibility (e.g., "SEO", "Google Ads")
    await sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'`;
    await sql`ALTER TABLE service_board_entries ADD COLUMN IF NOT EXISTS generated_email TEXT DEFAULT ''`;
    // Backfill: auto-tag untagged tickets for clients with service packages
    await sql`
      UPDATE tickets t SET service_category = sub.category
      FROM (
        SELECT DISTINCT ON (cp.client_id) cp.client_id, p.category
        FROM client_packages cp
        JOIN packages p ON p.id = cp.package_id
        WHERE cp.active = true AND p.category IN ('retainer', 'seo', 'google_ads')
        ORDER BY cp.client_id,
          CASE p.category WHEN 'retainer' THEN 1 WHEN 'seo' THEN 2 WHEN 'google_ads' THEN 3 END
      ) sub
      WHERE t.client_id = sub.client_id AND t.service_category IS NULL
    `;
    results.push("025: service_board_entries + tickets.service_category + team_member tags — OK");

    // Migration 026: Slack conversation state for multi-turn assistant flows
    await sql`
      CREATE TABLE IF NOT EXISTS slack_conversations (
        id SERIAL PRIMARY KEY,
        thread_ts VARCHAR(50) NOT NULL UNIQUE,
        channel_id VARCHAR(50) NOT NULL,
        intent VARCHAR(50) NOT NULL,
        state VARCHAR(50) NOT NULL DEFAULT 'processing',
        data JSONB DEFAULT '{}',
        owner_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_slack_conv_thread ON slack_conversations(thread_ts)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_slack_conv_expires ON slack_conversations(expires_at)`;
    results.push("026: slack_conversations — OK");

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Migration failed",
        results,
      },
      { status: 500 }
    );
  }
}
