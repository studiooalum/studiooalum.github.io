CREATE TABLE IF NOT EXISTS workshop_booking_configs (
  workshop_slug TEXT PRIMARY KEY,
  workshop_type TEXT NOT NULL DEFAULT 'event',
  price_tiers_json TEXT NOT NULL DEFAULT '{}',
  fixed_price INTEGER NOT NULL DEFAULT 0,
  min_participants INTEGER NOT NULL DEFAULT 1,
  max_participants INTEGER NOT NULL DEFAULT 4,
  payment_deadline_hours INTEGER NOT NULL DEFAULT 48,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(workshop_slug) REFERENCES workshops(slug) ON DELETE CASCADE
);

INSERT OR IGNORE INTO workshop_booking_configs (
  workshop_slug,
  workshop_type,
  price_tiers_json,
  fixed_price,
  min_participants,
  max_participants,
  payment_deadline_hours,
  created_at,
  updated_at
)
SELECT
  slug,
  CASE
    WHEN json_extract(booking_config_json, '$.workshopType') IN ('daily', 'event', 'multiSession')
      THEN json_extract(booking_config_json, '$.workshopType')
    WHEN json_extract(booking_config_json, '$.type') = 'one_day_open'
      THEN 'daily'
    WHEN json_extract(booking_config_json, '$.type') = 'multi_session'
      THEN 'multiSession'
    WHEN json_extract(booking_config_json, '$.type') = 'one_day_fixed'
      THEN 'event'
    WHEN json_extract(booking_config_json, '$.mode') = 'daily'
      THEN 'daily'
    ELSE 'event'
  END,
  COALESCE(
    json_extract(booking_config_json, '$.attendeePrices'),
    json_extract(booking_config_json, '$.priceTiers'),
    '{}'
  ),
  COALESCE(json_extract(booking_config_json, '$.fixedPrice'), price, 0),
  COALESCE(json_extract(booking_config_json, '$.minParticipants'), 1),
  COALESCE(json_extract(booking_config_json, '$.maxParticipants'), max_capacity, 4),
  COALESCE(json_extract(booking_config_json, '$.paymentDeadlineHours'), 48),
  created_at,
  updated_at
FROM workshops;

CREATE TABLE IF NOT EXISTS workshop_groups (
  id TEXT PRIMARY KEY,
  workshop_slug TEXT NOT NULL,
  requested_date TEXT NOT NULL,
  group_mode TEXT NOT NULL DEFAULT 'open',
  status TEXT NOT NULL DEFAULT 'open',
  current_participants INTEGER NOT NULL DEFAULT 0,
  max_participants INTEGER NOT NULL DEFAULT 4,
  final_participants INTEGER,
  price_snapshot TEXT NOT NULL DEFAULT '{}',
  payment_deadline_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(workshop_slug) REFERENCES workshops(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workshop_groups_date_status
  ON workshop_groups(workshop_slug, requested_date, status, created_at ASC);

ALTER TABLE workshop_reservations ADD COLUMN group_id TEXT;
ALTER TABLE workshop_reservations ADD COLUMN booking_type TEXT NOT NULL DEFAULT 'event';
ALTER TABLE workshop_reservations ADD COLUMN join_policy TEXT NOT NULL DEFAULT 'private';
ALTER TABLE workshop_reservations ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE workshop_reservations ADD COLUMN requested_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workshop_reservations ADD COLUMN final_amount INTEGER;
ALTER TABLE workshop_reservations ADD COLUMN price_pending INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workshop_reservations ADD COLUMN amount_due INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workshop_reservations ADD COLUMN amount_paid INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workshop_reservations ADD COLUMN payment_order_id TEXT;
ALTER TABLE workshop_reservations ADD COLUMN checkout_token TEXT;
ALTER TABLE workshop_reservations ADD COLUMN price_snapshot TEXT NOT NULL DEFAULT '{}';
ALTER TABLE workshop_reservations ADD COLUMN paid_at TEXT;
ALTER TABLE workshop_reservations ADD COLUMN cancelled_at TEXT;

CREATE INDEX IF NOT EXISTS idx_workshop_reservations_group
  ON workshop_reservations(group_id, status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_workshop_reservations_join_policy
  ON workshop_reservations(slot_key, join_policy, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workshop_reservations_checkout_token
  ON workshop_reservations(checkout_token)
  WHERE checkout_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS workshop_payment_orders (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  workshop_slug TEXT NOT NULL,
  order_id TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KRW',
  status TEXT NOT NULL DEFAULT 'pending',
  payment_key TEXT,
  provider TEXT NOT NULL DEFAULT 'toss',
  provider_status TEXT NOT NULL DEFAULT '',
  checkout_expires_at TEXT NOT NULL,
  paid_at TEXT,
  cancelled_at TEXT,
  raw_response TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(reservation_id) REFERENCES workshop_reservations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workshop_payment_orders_reservation
  ON workshop_payment_orders(reservation_id, status, created_at DESC);