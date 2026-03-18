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
