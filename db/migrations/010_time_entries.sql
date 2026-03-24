-- Migration 010: Time entries for time tracking
CREATE TABLE IF NOT EXISTS time_entries (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_seconds INTEGER,
  is_manual BOOLEAN DEFAULT false,
  note VARCHAR(500) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_ticket ON time_entries(ticket_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_member ON time_entries(team_member_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_start ON time_entries(start_time);
CREATE INDEX IF NOT EXISTS idx_time_entries_running ON time_entries(end_time) WHERE end_time IS NULL;
