import { sql } from "@vercel/postgres";

export async function runCrmMigration(): Promise<void> {
  // CRM columns on clients
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

  // Packages table
  await sql`
    CREATE TABLE IF NOT EXISTS packages (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      description TEXT DEFAULT '',
      default_price NUMERIC(10,2) NOT NULL DEFAULT 0,
      category VARCHAR(30) DEFAULT 'other',
      hours_included NUMERIC(5,1),
      included_services TEXT[] DEFAULT '{}',
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE packages ADD COLUMN IF NOT EXISTS category VARCHAR(30) DEFAULT 'other'`;
  await sql`ALTER TABLE packages ADD COLUMN IF NOT EXISTS hours_included NUMERIC(5,1)`;
  await sql`ALTER TABLE packages ADD COLUMN IF NOT EXISTS billing_frequency VARCHAR(20) DEFAULT 'monthly'`;

  // Client packages
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
  await sql`ALTER TABLE client_packages DROP CONSTRAINT IF EXISTS client_packages_client_id_package_id_key`;
  await sql`ALTER TABLE client_packages ADD COLUMN IF NOT EXISTS custom_hours NUMERIC(5,1)`;

  // Client notes
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

  // Team members
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
  await sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS color VARCHAR(30) DEFAULT ''`;
  await sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS start_date DATE`;
  await sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS birthday DATE`;
}
