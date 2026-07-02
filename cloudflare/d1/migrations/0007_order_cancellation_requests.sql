CREATE TABLE IF NOT EXISTS order_cancellation_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  user_id TEXT,
  mode TEXT NOT NULL DEFAULT 'approval',
  status TEXT NOT NULL DEFAULT 'pending',
  request_note TEXT NOT NULL DEFAULT '',
  approval_token TEXT NOT NULL UNIQUE,
  expires_at TEXT,
  requested_at TEXT NOT NULL,
  decided_at TEXT,
  processed_at TEXT,
  decision_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_order_cancellation_requests_order_id ON order_cancellation_requests(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_cancellation_requests_status ON order_cancellation_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_cancellation_requests_token ON order_cancellation_requests(approval_token);