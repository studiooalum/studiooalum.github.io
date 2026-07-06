CREATE TABLE IF NOT EXISTS workshop_schedule_blocks (
  id TEXT PRIMARY KEY,
  workshop_slug TEXT NOT NULL,
  workshop_title TEXT NOT NULL DEFAULT '',
  slot_date TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workshop_slug, slot_date)
);

CREATE INDEX IF NOT EXISTS idx_workshop_schedule_blocks_slug_date
  ON workshop_schedule_blocks(workshop_slug, slot_date);