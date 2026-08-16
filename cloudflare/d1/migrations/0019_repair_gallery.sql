CREATE TABLE IF NOT EXISTS repair_gallery_images (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT '',
  methods_json TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repair_gallery_status_sort
  ON repair_gallery_images(status, sort_order, created_at DESC);