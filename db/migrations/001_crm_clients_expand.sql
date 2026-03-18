-- Migration 001: Expand clients table with CRM fields
-- All columns are nullable or have defaults so existing rows are unaffected

-- Contact info
ALTER TABLE clients ADD COLUMN IF NOT EXISTS website_url VARCHAR(500) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_name VARCHAR(200) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50) DEFAULT '';

-- Contract & billing
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_start_date DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_end_date DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mrr NUMERIC(10,2) DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS country VARCHAR(2) DEFAULT 'CA';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS seo_hours_allocated NUMERIC(5,1) DEFAULT 0;

-- Team
ALTER TABLE clients ADD COLUMN IF NOT EXISTS account_specialist VARCHAR(200) DEFAULT '';

-- Address
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS city VARCHAR(100) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS province_state VARCHAR(100) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20) DEFAULT '';

-- CRM metadata
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_status VARCHAR(20) DEFAULT 'active';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS offboarding_date DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS industry VARCHAR(100) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_contact_date TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS next_review_date DATE;

-- Social media
ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_linkedin VARCHAR(500) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_facebook VARCHAR(500) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_instagram VARCHAR(500) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_x VARCHAR(500) DEFAULT '';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(client_status);
CREATE INDEX IF NOT EXISTS idx_clients_country ON clients(country);
CREATE INDEX IF NOT EXISTS idx_clients_specialist ON clients(account_specialist);
