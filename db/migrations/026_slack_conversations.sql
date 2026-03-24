-- Slack conversation state for multi-turn assistant flows
CREATE TABLE IF NOT EXISTS slack_conversations (
  id SERIAL PRIMARY KEY,
  thread_ts VARCHAR(50) NOT NULL UNIQUE,
  channel_id VARCHAR(50) NOT NULL,
  intent VARCHAR(50) NOT NULL,
  state VARCHAR(50) NOT NULL DEFAULT 'processing',
  data JSONB DEFAULT '{}',
  owner_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_slack_conv_thread ON slack_conversations(thread_ts);
CREATE INDEX IF NOT EXISTS idx_slack_conv_expires ON slack_conversations(expires_at);
