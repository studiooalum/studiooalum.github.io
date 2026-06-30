ALTER TABLE orders ADD COLUMN points_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN points_earned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN points_reservation_expires_at TEXT;
ALTER TABLE orders ADD COLUMN points_spent_at TEXT;
ALTER TABLE orders ADD COLUMN points_released_at TEXT;
ALTER TABLE orders ADD COLUMN points_refunded_at TEXT;
ALTER TABLE orders ADD COLUMN points_earned_at TEXT;
ALTER TABLE orders ADD COLUMN points_earned_reversed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_points_reservation ON orders(user_id, points_reservation_expires_at);

CREATE TABLE IF NOT EXISTS point_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  order_id TEXT,
  kind TEXT NOT NULL,
  points_delta INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL,
  UNIQUE(order_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_point_transactions_user_id ON point_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_point_transactions_order_id ON point_transactions(order_id, created_at DESC);