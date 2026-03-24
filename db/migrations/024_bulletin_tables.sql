-- Personal notes (one per user, upsert pattern)
CREATE TABLE IF NOT EXISTS personal_notes (
  id SERIAL PRIMARY KEY,
  team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_member_id)
);

-- Team announcements (unified: general, birthday, anniversary, time_off)
CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES team_members(id),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  pinned BOOLEAN DEFAULT false,
  source VARCHAR(30) DEFAULT 'manual',
  announcement_type VARCHAR(30) DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC);

-- Weekly quotes (10 generated per week, 1 selected)
CREATE TABLE IF NOT EXISTS weekly_quotes (
  id SERIAL PRIMARY KEY,
  quote TEXT NOT NULL,
  author VARCHAR(255) DEFAULT '',
  week_start DATE NOT NULL,
  selected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_weekly_quotes_week ON weekly_quotes(week_start DESC);
