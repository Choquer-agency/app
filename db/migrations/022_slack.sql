-- Add Slack user ID to team members for Slack integration
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS slack_user_id VARCHAR(50) DEFAULT '';

-- Log of outbound Slack messages for audit and tracking
CREATE TABLE IF NOT EXISTS slack_messages (
  id SERIAL PRIMARY KEY,
  team_member_id INTEGER NOT NULL REFERENCES team_members(id),
  message_type VARCHAR(50) NOT NULL,  -- 'eod_checkin', 'weekly_summary'
  message_text TEXT NOT NULL,
  slack_ts VARCHAR(50) DEFAULT '',     -- Slack message timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slack_messages_member ON slack_messages(team_member_id);
CREATE INDEX IF NOT EXISTS idx_slack_messages_type ON slack_messages(message_type);
CREATE INDEX IF NOT EXISTS idx_slack_messages_created ON slack_messages(created_at DESC);
