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
