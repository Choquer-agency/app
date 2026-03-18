-- Migration 004: Client notes / activity timeline
CREATE TABLE IF NOT EXISTS client_notes (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  author VARCHAR(200) NOT NULL DEFAULT 'Admin',
  note_type VARCHAR(30) NOT NULL DEFAULT 'note',
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_notes_client ON client_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_type ON client_notes(note_type);
CREATE INDEX IF NOT EXISTS idx_client_notes_created ON client_notes(created_at DESC);
