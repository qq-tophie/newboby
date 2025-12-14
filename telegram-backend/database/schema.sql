-- RobBob Telegram Backend Database Schema
-- PostgreSQL

-- Main sessions table
CREATE TABLE IF NOT EXISTS telegram_sessions (
  id SERIAL PRIMARY KEY,
  session_id UUID UNIQUE NOT NULL,
  launcher_device_id VARCHAR(255) NOT NULL,
  telegram_user_id BIGINT,
  telegram_username VARCHAR(255),
  channel_member BOOLEAN DEFAULT FALSE,
  membership_token VARCHAR(255),
  token_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP,
  last_validated_at TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_session_id ON telegram_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_device_id ON telegram_sessions(launcher_device_id);
CREATE INDEX IF NOT EXISTS idx_membership_token ON telegram_sessions(membership_token);
CREATE INDEX IF NOT EXISTS idx_telegram_user_id ON telegram_sessions(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_created_at ON telegram_sessions(created_at);

-- Optional: audit log table for tracking authentication events
CREATE TABLE IF NOT EXISTS auth_logs (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(255),
  action VARCHAR(50),
  success BOOLEAN,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_logs_device ON auth_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_auth_logs_created ON auth_logs(created_at);

-- Optional: cleanup old sessions (run periodically)
-- DELETE FROM telegram_sessions WHERE created_at < NOW() - INTERVAL '30 days' AND channel_member = FALSE;
