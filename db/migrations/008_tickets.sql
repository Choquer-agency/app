-- Migration 008: Tickets, ticket assignees, and saved views
-- Phase 2 of Task Management build

-- Global ticket number sequence for CHQ-XXX numbering
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1;

-- Tickets table
CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  ticket_number VARCHAR(20) NOT NULL UNIQUE,
  title VARCHAR(500) NOT NULL,
  description TEXT DEFAULT '',
  description_format VARCHAR(10) DEFAULT 'plain',
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  project_id INTEGER,  -- FK added in Phase 10 when projects table exists
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
);

CREATE INDEX IF NOT EXISTS idx_tickets_client ON tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_tickets_parent ON tickets(parent_ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_due ON tickets(due_date);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_archived ON tickets(archived);
CREATE INDEX IF NOT EXISTS idx_tickets_number ON tickets(ticket_number);

-- Ticket assignees (many-to-many junction table)
CREATE TABLE IF NOT EXISTS ticket_assignees (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ticket_id, team_member_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_assignees_ticket ON ticket_assignees(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_assignees_member ON ticket_assignees(team_member_id);

-- Saved views (per team member filter presets, UI wired in Phase 4)
CREATE TABLE IF NOT EXISTS saved_views (
  id SERIAL PRIMARY KEY,
  team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_views_member ON saved_views(team_member_id);
