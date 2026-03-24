CREATE TABLE IF NOT EXISTS ticket_comments (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_type VARCHAR(10) NOT NULL DEFAULT 'team',
  author_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  author_name VARCHAR(200) NOT NULL,
  author_email VARCHAR(300) DEFAULT '',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_created ON ticket_comments(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_author ON ticket_comments(author_id);
