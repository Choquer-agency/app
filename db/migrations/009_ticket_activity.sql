-- Phase 3: Ticket Activity Log
-- Tracks every mutation to tickets for audit trail and detail modal activity sidebar

CREATE TABLE IF NOT EXISTS ticket_activity (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  actor_name VARCHAR(200) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  field_name VARCHAR(100),
  old_value VARCHAR(500),
  new_value VARCHAR(500),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_activity_ticket ON ticket_activity(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_activity_created ON ticket_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_activity_actor ON ticket_activity(actor_id);
