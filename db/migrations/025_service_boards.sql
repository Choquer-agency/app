-- Service Board Entries: monthly tracking rows for SEO, Google Ads, and Retainer clients
-- Auto-populated lazily when a board is viewed for a given month

CREATE TABLE IF NOT EXISTS service_board_entries (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_package_id INTEGER NOT NULL REFERENCES client_packages(id) ON DELETE CASCADE,
  category VARCHAR(30) NOT NULL,  -- 'seo' | 'google_ads' | 'retainer'
  month DATE NOT NULL,            -- First day of month, e.g. '2026-03-01'
  status VARCHAR(30) NOT NULL DEFAULT 'needs_attention',
    -- needs_attention | in_progress | report_ready | email_sent
  specialist_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  monthly_email_sent_at TIMESTAMPTZ,
  quarterly_email_sent_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_package_id, month)
);

CREATE INDEX IF NOT EXISTS idx_sbe_client ON service_board_entries(client_id);
CREATE INDEX IF NOT EXISTS idx_sbe_category ON service_board_entries(category);
CREATE INDEX IF NOT EXISTS idx_sbe_month ON service_board_entries(month);
CREATE INDEX IF NOT EXISTS idx_sbe_status ON service_board_entries(status);

-- Tag tickets with a service category for per-category hour aggregation
-- Tickets with service_category set are hidden from the main Task Management view
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS service_category VARCHAR(30);
CREATE INDEX IF NOT EXISTS idx_tickets_service_category ON tickets(service_category);

-- Team member tags for board visibility (e.g., "SEO", "Google Ads")
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
