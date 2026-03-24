-- Migration 015: Recurring Ticket Templates
-- Phase 11 of Task Management build

CREATE TABLE IF NOT EXISTS recurring_ticket_templates (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT DEFAULT '',
  description_format VARCHAR(10) DEFAULT 'plain',
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  priority VARCHAR(10) NOT NULL DEFAULT 'normal',
  ticket_group VARCHAR(100) DEFAULT '',
  recurrence_rule VARCHAR(20) NOT NULL,
  recurrence_day INTEGER NOT NULL DEFAULT 1,
  next_create_at DATE NOT NULL,
  active BOOLEAN DEFAULT true,
  created_by_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_client ON recurring_ticket_templates(client_id);
CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_ticket_templates(active);
CREATE INDEX IF NOT EXISTS idx_recurring_next ON recurring_ticket_templates(next_create_at);
CREATE INDEX IF NOT EXISTS idx_recurring_project ON recurring_ticket_templates(project_id);

-- Junction table for template assignees (mirrors ticket_assignees pattern)
CREATE TABLE IF NOT EXISTS recurring_template_assignees (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES recurring_ticket_templates(id) ON DELETE CASCADE,
  team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  UNIQUE(template_id, team_member_id)
);

CREATE INDEX IF NOT EXISTS idx_recurring_assignees_template ON recurring_template_assignees(template_id);
CREATE INDEX IF NOT EXISTS idx_recurring_assignees_member ON recurring_template_assignees(team_member_id);
