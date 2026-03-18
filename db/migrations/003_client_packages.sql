-- Migration 003: Client-package assignments (junction table)
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
  -- No unique constraint: clients can have multiple of the same package
);

CREATE INDEX IF NOT EXISTS idx_client_packages_client ON client_packages(client_id);
CREATE INDEX IF NOT EXISTS idx_client_packages_package ON client_packages(package_id);
CREATE INDEX IF NOT EXISTS idx_client_packages_active ON client_packages(active);
