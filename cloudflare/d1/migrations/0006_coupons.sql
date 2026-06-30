ALTER TABLE orders ADD COLUMN coupon_id TEXT;
ALTER TABLE orders ADD COLUMN coupon_code TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN coupon_title TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN coupon_scope TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN coupon_discount_type TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN coupon_discount_value INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN coupon_discount_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN coupon_reservation_expires_at TEXT;
ALTER TABLE orders ADD COLUMN coupon_reserved_at TEXT;
ALTER TABLE orders ADD COLUMN coupon_released_at TEXT;
ALTER TABLE orders ADD COLUMN coupon_applied_at TEXT;
ALTER TABLE orders ADD COLUMN coupon_reinstated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_coupon_reservation ON orders(coupon_id, coupon_reservation_expires_at);

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'targeted',
  user_id TEXT,
  email_normalized TEXT NOT NULL DEFAULT '',
  discount_type TEXT NOT NULL,
  discount_value INTEGER NOT NULL,
  minimum_order_amount INTEGER NOT NULL DEFAULT 0,
  maximum_discount_amount INTEGER,
  usage_limit INTEGER NOT NULL DEFAULT 1,
  starts_at TEXT,
  expires_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_target ON coupons(email_normalized, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active, created_at DESC);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  user_id TEXT,
  email_normalized TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'reserved',
  discount_amount INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(coupon_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_order ON coupon_redemptions(order_id, updated_at DESC);