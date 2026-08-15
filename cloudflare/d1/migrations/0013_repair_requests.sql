CREATE TABLE IF NOT EXISTS repair_requests (
  id TEXT PRIMARY KEY,
  request_number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  contact_preference TEXT NOT NULL DEFAULT 'email',
  item_type TEXT NOT NULL DEFAULT '',
  item_brand TEXT NOT NULL DEFAULT '',
  item_material TEXT NOT NULL DEFAULT '',
  item_color TEXT NOT NULL DEFAULT '',
  repair_details TEXT NOT NULL DEFAULT '',
  desired_completion_date TEXT NOT NULL DEFAULT '',
  terms_accepted_at TEXT NOT NULL,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'submitted',
  admin_note TEXT NOT NULL DEFAULT '',
  customer_message TEXT NOT NULL DEFAULT '',
  quote_amount INTEGER,
  quoted_at TEXT,
  accepted_at TEXT,
  completed_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repair_requests_status_created
  ON repair_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_requests_email
  ON repair_requests(email_normalized, created_at DESC);

CREATE TABLE IF NOT EXISTS repair_request_images (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT '',
  byte_size INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(request_id) REFERENCES repair_requests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_repair_request_images_request
  ON repair_request_images(request_id, sort_order, created_at ASC);