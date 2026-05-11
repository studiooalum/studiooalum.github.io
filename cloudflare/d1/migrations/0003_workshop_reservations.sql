CREATE TABLE IF NOT EXISTS workshop_reservations (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  workshop_slug TEXT NOT NULL,
  workshop_title TEXT NOT NULL,
  workshop_category TEXT NOT NULL DEFAULT '',
  workshop_location TEXT NOT NULL DEFAULT '',
  slot_key TEXT NOT NULL,
  slot_label TEXT NOT NULL DEFAULT '',
  slot_date TEXT NOT NULL,
  slot_start_time TEXT NOT NULL,
  slot_end_time TEXT NOT NULL DEFAULT '',
  attendee_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'confirmed',
  note TEXT NOT NULL DEFAULT '',
  workshop_snapshot TEXT NOT NULL DEFAULT '{}',
  slot_snapshot TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(slot_key, email_normalized)
);

CREATE INDEX IF NOT EXISTS idx_workshop_reservations_user_id ON workshop_reservations(user_id, slot_date DESC, slot_start_time DESC);
CREATE INDEX IF NOT EXISTS idx_workshop_reservations_email ON workshop_reservations(email_normalized, slot_date DESC, slot_start_time DESC);
CREATE INDEX IF NOT EXISTS idx_workshop_reservations_slot ON workshop_reservations(slot_key, status);