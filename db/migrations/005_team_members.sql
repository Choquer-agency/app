-- Migration 005: Team members (for account specialist dropdown + future ticketing)
CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(100) DEFAULT '',
  cal_link VARCHAR(500) DEFAULT '',
  profile_pic_url VARCHAR(500) DEFAULT '',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
