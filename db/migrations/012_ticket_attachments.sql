CREATE TABLE IF NOT EXISTS ticket_attachments (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  uploaded_by_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  uploaded_by_name VARCHAR(200) DEFAULT '',
  file_name VARCHAR(500) NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  file_type VARCHAR(200) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON ticket_attachments(ticket_id);
