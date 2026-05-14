-- Existing DB migration for member-linked orders and OAuth identities.
-- Apply once to older D1 databases that were created before the latest schema.sql.

ALTER TABLE orders ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  zipcode TEXT NOT NULL DEFAULT '',
  address1 TEXT NOT NULL DEFAULT '',
  address2 TEXT NOT NULL DEFAULT '',
  points_balance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email_normalized ON users(email_normalized);

CREATE TABLE IF NOT EXISTS auth_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  provider_email TEXT NOT NULL DEFAULT '',
  provider_email_normalized TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_auth_identities_user_id ON auth_identities(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_auth_identities_provider_email ON auth_identities(provider, provider_email_normalized);

CREATE TABLE IF NOT EXISTS auth_login_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_normalized TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_login_codes_email ON auth_login_codes(email_normalized, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_login_codes_expires_at ON auth_login_codes(expires_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);