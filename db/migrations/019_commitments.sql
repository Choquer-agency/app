-- Accountability: Commitment tracking for tickets

CREATE TABLE IF NOT EXISTS ticket_commitments (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  team_member_id INTEGER NOT NULL REFERENCES team_members(id),
  committed_date DATE NOT NULL,
  committed_at TIMESTAMPTZ DEFAULT NOW(),
  committed_by_id INTEGER REFERENCES team_members(id),
  status VARCHAR(20) DEFAULT 'active',  -- active, met, missed
  resolved_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  UNIQUE(ticket_id, team_member_id, committed_date)
);

CREATE INDEX IF NOT EXISTS idx_commitments_ticket ON ticket_commitments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_commitments_member ON ticket_commitments(team_member_id);
CREATE INDEX IF NOT EXISTS idx_commitments_status ON ticket_commitments(status);
CREATE INDEX IF NOT EXISTS idx_commitments_date ON ticket_commitments(committed_date);
