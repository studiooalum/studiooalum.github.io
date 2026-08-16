ALTER TABLE newsletter_posts ADD COLUMN categories_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  subscribed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);