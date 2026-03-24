-- Migration 006: Team member authentication
-- Add individual password support to replace shared ADMIN_PASSWORD

-- Password hash for bcryptjs (nullable = uses shared password fallback)
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Role level: 'admin' can manage passwords, 'member' is default
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS role_level VARCHAR(20) DEFAULT 'member';

-- Track last login timestamp
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
