-- Activity tracking log
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  client_slug VARCHAR(100) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_detail JSONB,
  session_id VARCHAR(36),
  device_type VARCHAR(20),
  referrer TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_client ON activity_log(client_slug);
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_session ON activity_log(session_id);

-- Monthly analytics snapshots for historical reports
CREATE TABLE IF NOT EXISTS monthly_snapshots (
  id SERIAL PRIMARY KEY,
  client_slug VARCHAR(100) NOT NULL,
  month DATE NOT NULL,
  gsc_data JSONB,
  ga4_data JSONB,
  keyword_data JSONB,
  kpi_summary JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_slug, month)
);

CREATE INDEX IF NOT EXISTS idx_snapshot_client ON monthly_snapshots(client_slug);
CREATE INDEX IF NOT EXISTS idx_snapshot_month ON monthly_snapshots(month);

-- Identified visitors (one per unique name per client)
CREATE TABLE IF NOT EXISTS visitors (
  id SERIAL PRIMARY KEY,
  client_slug VARCHAR(100) NOT NULL,
  visitor_name VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_visitors_unique_name
  ON visitors(client_slug, LOWER(visitor_name));
CREATE INDEX IF NOT EXISTS idx_visitors_client ON visitors(client_slug);

-- Device-to-visitor mapping (supports multiple devices per person)
CREATE TABLE IF NOT EXISTS visitor_devices (
  id SERIAL PRIMARY KEY,
  visitor_id INTEGER NOT NULL REFERENCES visitors(id),
  device_id VARCHAR(36) NOT NULL UNIQUE,
  device_type VARCHAR(20),
  user_agent TEXT,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visitor_devices_device ON visitor_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_visitor_devices_visitor ON visitor_devices(visitor_id);

-- Link events to visitors (nullable for backward compat with existing data)
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS visitor_id INTEGER REFERENCES visitors(id);
CREATE INDEX IF NOT EXISTS idx_activity_visitor ON activity_log(visitor_id);

-- AI-enriched content from Notion pages
CREATE TABLE IF NOT EXISTS enriched_content (
  id SERIAL PRIMARY KEY,
  client_slug VARCHAR(100) NOT NULL,
  month DATE NOT NULL,
  raw_content TEXT,
  enriched_data JSONB NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_slug, month)
);

CREATE INDEX IF NOT EXISTS idx_enriched_client ON enriched_content(client_slug);
CREATE INDEX IF NOT EXISTS idx_enriched_month ON enriched_content(month);

-- Client configuration (replaces Notion client database)
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  ga4_property_id VARCHAR(100) DEFAULT '',
  gsc_site_url VARCHAR(500) DEFAULT '',
  se_rankings_project_id VARCHAR(100) DEFAULT '',
  cal_link VARCHAR(500) DEFAULT 'https://cal.com/andres-agudelo-hqlknm/15min',
  notion_page_url VARCHAR(500) DEFAULT '',
  notion_page_id VARCHAR(100) DEFAULT '',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_slug ON clients(slug);
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(active);

-- CRM expansion columns on clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS website_url VARCHAR(500) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_name VARCHAR(200) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_start_date DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_end_date DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mrr NUMERIC(10,2) DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS country VARCHAR(2) DEFAULT 'CA';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS seo_hours_allocated NUMERIC(5,1) DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS account_specialist VARCHAR(200) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS city VARCHAR(100) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS province_state VARCHAR(100) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_status VARCHAR(20) DEFAULT 'active';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS offboarding_date DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS industry VARCHAR(100) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_contact_date TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS next_review_date DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_linkedin VARCHAR(500) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_facebook VARCHAR(500) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_instagram VARCHAR(500) DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_x VARCHAR(500) DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(client_status);
CREATE INDEX IF NOT EXISTS idx_clients_country ON clients(country);
CREATE INDEX IF NOT EXISTS idx_clients_specialist ON clients(account_specialist);

-- Packages (service offerings)
CREATE TABLE IF NOT EXISTS packages (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT DEFAULT '',
  default_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  included_services TEXT[] DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packages_active ON packages(active);

-- Client-package assignments
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
  updated_at TIMESTAMPTZ DEFAULT NOW(),
);

CREATE INDEX IF NOT EXISTS idx_client_packages_client ON client_packages(client_id);
CREATE INDEX IF NOT EXISTS idx_client_packages_package ON client_packages(package_id);
CREATE INDEX IF NOT EXISTS idx_client_packages_active ON client_packages(active);

-- Client notes / activity timeline
CREATE TABLE IF NOT EXISTS client_notes (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  author VARCHAR(200) NOT NULL DEFAULT 'Admin',
  note_type VARCHAR(30) NOT NULL DEFAULT 'note',
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_notes_client ON client_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_type ON client_notes(note_type);
CREATE INDEX IF NOT EXISTS idx_client_notes_created ON client_notes(created_at DESC);

-- Client approval requests (triggered from Notion, actioned on dashboard)
CREATE TABLE IF NOT EXISTS approvals (
  id SERIAL PRIMARY KEY,
  client_slug VARCHAR(100) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_slug, title)
);

CREATE INDEX IF NOT EXISTS idx_approvals_client ON approvals(client_slug);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

-- Team members (for specialist dropdown + future ticketing)
CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(100) DEFAULT '',
  cal_link VARCHAR(500) DEFAULT '',
  profile_pic_url VARCHAR(500) DEFAULT '',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
