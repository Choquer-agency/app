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
    results.push("003: client_packages table — OK");

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
