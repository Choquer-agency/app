-- Meeting notes: store transcripts and AI-extracted action items
CREATE TABLE IF NOT EXISTS meeting_notes (
  id SERIAL PRIMARY KEY,
  team_member_id INTEGER NOT NULL REFERENCES team_members(id),
  created_by_id INTEGER NOT NULL REFERENCES team_members(id),
  transcript TEXT NOT NULL,
  summary TEXT DEFAULT '',
  raw_extraction JSONB DEFAULT '[]',
  meeting_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source VARCHAR(50) DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_notes_member ON meeting_notes(team_member_id);
CREATE INDEX IF NOT EXISTS idx_meeting_notes_date ON meeting_notes(meeting_date DESC);
