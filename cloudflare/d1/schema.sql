PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  order_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  currency TEXT NOT NULL DEFAULT 'KRW',
  subtotal_amount INTEGER NOT NULL DEFAULT 0,
  shipping_amount INTEGER NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  points_used INTEGER NOT NULL DEFAULT 0,
  points_earned INTEGER NOT NULL DEFAULT 0,
  total_amount INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  zipcode TEXT NOT NULL,
  address1 TEXT NOT NULL,
  address2 TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  active_payment_key TEXT,
  coupon_id TEXT,
  coupon_code TEXT NOT NULL DEFAULT '',
  coupon_title TEXT NOT NULL DEFAULT '',
  coupon_scope TEXT NOT NULL DEFAULT '',
  coupon_discount_type TEXT NOT NULL DEFAULT '',
  coupon_discount_value INTEGER NOT NULL DEFAULT 0,
  coupon_discount_amount INTEGER NOT NULL DEFAULT 0,
  coupon_reservation_expires_at TEXT,
  coupon_reserved_at TEXT,
  coupon_released_at TEXT,
  coupon_applied_at TEXT,
  coupon_reinstated_at TEXT,
  points_reservation_expires_at TEXT,
  points_spent_at TEXT,
  points_released_at TEXT,
  points_refunded_at TEXT,
  points_earned_at TEXT,
  points_earned_reversed_at TEXT,
  paid_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_active_payment_key ON orders(active_payment_key);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_coupon_reservation ON orders(coupon_id, coupon_reservation_expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_points_reservation ON orders(user_id, points_reservation_expires_at);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  line_id TEXT NOT NULL,
  product_id TEXT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL DEFAULT '',
  edition_label TEXT,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  snapshot TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_items_order_line_id ON order_items(order_id, line_id);

CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'confirmed',
  carrier_id TEXT NOT NULL DEFAULT '',
  carrier TEXT NOT NULL DEFAULT '',
  tracking_number TEXT NOT NULL DEFAULT '',
  tracking_url TEXT NOT NULL DEFAULT '',
  tracker_registered_at TEXT,
  tracker_last_synced_at TEXT,
  tracker_last_event_at TEXT,
  tracker_last_event_code TEXT NOT NULL DEFAULT '',
  tracker_last_event_name TEXT NOT NULL DEFAULT '',
  tracker_last_event_description TEXT NOT NULL DEFAULT '',
  shipped_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking_ref ON shipments(carrier_id, tracking_number);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  payment_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'toss',
  provider_mode TEXT NOT NULL,
  toss_order_id TEXT,
  method TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_amount INTEGER NOT NULL,
  approved_amount INTEGER,
  raw_request TEXT NOT NULL DEFAULT '{}',
  raw_response TEXT NOT NULL DEFAULT '{}',
  requested_at TEXT NOT NULL,
  approved_at TEXT,
  failed_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_key ON payments(payment_key);
CREATE INDEX IF NOT EXISTS idx_payments_toss_order_id ON payments(toss_order_id);

CREATE TABLE IF NOT EXISTS payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT,
  payment_id INTEGER,
  provider TEXT NOT NULL DEFAULT 'toss',
  event_type TEXT NOT NULL,
  delivery_id TEXT,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY(payment_id) REFERENCES payments(id) ON DELETE SET NULL,
  UNIQUE(provider, delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_events_order_id ON payment_events(order_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_type ON payment_events(event_type);

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

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  zipcode TEXT NOT NULL DEFAULT '',
  address1 TEXT NOT NULL DEFAULT '',
  address2 TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  password_salt TEXT NOT NULL DEFAULT '',
  privacy_policy_accepted_at TEXT,
  terms_accepted_at TEXT,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  marketing_opt_in_at TEXT,
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

CREATE TABLE IF NOT EXISTS workshops (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  duration_label TEXT NOT NULL DEFAULT '',
  level_label TEXT NOT NULL DEFAULT '',
  audience_label TEXT NOT NULL DEFAULT '',
  max_capacity INTEGER NOT NULL DEFAULT 0,
  capacity_label TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0,
  booking_notice TEXT NOT NULL DEFAULT '',
  host_name TEXT NOT NULL DEFAULT '',
  location_name TEXT NOT NULL DEFAULT '',
  location_address TEXT NOT NULL DEFAULT '',
  location_detail TEXT NOT NULL DEFAULT '',
  materials_json TEXT NOT NULL DEFAULT '[]',
  things_to_bring_json TEXT NOT NULL DEFAULT '[]',
  poster_image_url TEXT NOT NULL DEFAULT '',
  poster_image_r2_key TEXT NOT NULL DEFAULT '',
  poster_image_alt TEXT NOT NULL DEFAULT '',
  gallery_images_json TEXT NOT NULL DEFAULT '[]',
  schedule_slots_json TEXT NOT NULL DEFAULT '[]',
  booking_config_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  source_mode TEXT NOT NULL DEFAULT 'd1',
  sort_order INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workshops_status_sort ON workshops(status, sort_order, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workshops_slug_status ON workshops(slug, status);

CREATE TABLE IF NOT EXISTS newsletter_posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT NOT NULL DEFAULT '',
  cover_image_r2_key TEXT NOT NULL DEFAULT '',
  cover_image_alt TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_newsletter_posts_status_published
  ON newsletter_posts(status, published_at DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS repair_requests (
  id TEXT PRIMARY KEY,
  request_number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  contact_preference TEXT NOT NULL DEFAULT 'email',
  preferred_contact TEXT NOT NULL DEFAULT 'email',
  item_type TEXT NOT NULL DEFAULT '',
  item_brand TEXT NOT NULL DEFAULT '',
  item_material TEXT NOT NULL DEFAULT '',
  item_color TEXT NOT NULL DEFAULT '',
  repair_details TEXT NOT NULL DEFAULT '',
  desired_result TEXT NOT NULL DEFAULT '',
  budget_note TEXT NOT NULL DEFAULT '',
  desired_completion_date TEXT NOT NULL DEFAULT '',
  terms_accepted_at TEXT NOT NULL,
  privacy_consent_at TEXT NOT NULL,
  archive_consent_at TEXT,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'received',
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
CREATE INDEX IF NOT EXISTS idx_repair_requests_archive_candidate
  ON repair_requests(archive_consent_at, status, completed_at DESC);

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
  group_id TEXT,
  booking_type TEXT NOT NULL DEFAULT 'event',
  join_policy TEXT NOT NULL DEFAULT 'private',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  requested_amount INTEGER NOT NULL DEFAULT 0,
  final_amount INTEGER,
  price_pending INTEGER NOT NULL DEFAULT 0,
  amount_due INTEGER NOT NULL DEFAULT 0,
  amount_paid INTEGER NOT NULL DEFAULT 0,
  payment_order_id TEXT,
  checkout_token TEXT,
  price_snapshot TEXT NOT NULL DEFAULT '{}',
  paid_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(slot_key, email_normalized)
);

CREATE INDEX IF NOT EXISTS idx_workshop_reservations_user_id ON workshop_reservations(user_id, slot_date DESC, slot_start_time DESC);
CREATE INDEX IF NOT EXISTS idx_workshop_reservations_email ON workshop_reservations(email_normalized, slot_date DESC, slot_start_time DESC);
CREATE INDEX IF NOT EXISTS idx_workshop_reservations_slot ON workshop_reservations(slot_key, status);
CREATE INDEX IF NOT EXISTS idx_workshop_reservations_group ON workshop_reservations(group_id, status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_workshop_reservations_join_policy ON workshop_reservations(slot_key, join_policy, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workshop_reservations_checkout_token ON workshop_reservations(checkout_token) WHERE checkout_token IS NOT NULL;

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

CREATE INDEX IF NOT EXISTS idx_workshop_groups_date_status ON workshop_groups(workshop_slug, requested_date, status, created_at ASC);

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

CREATE INDEX IF NOT EXISTS idx_workshop_payment_orders_reservation ON workshop_payment_orders(reservation_id, status, created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_workshop_schedule_blocks_slug_date ON workshop_schedule_blocks(workshop_slug, slot_date);

CREATE TRIGGER IF NOT EXISTS trg_workshop_reservations_capacity_insert
BEFORE INSERT ON workshop_reservations
WHEN NEW.status IN ('waiting_for_group', 'waiting_for_payment', 'confirmed')
BEGIN
  SELECT CASE
    WHEN (
      COALESCE((
        SELECT SUM(attendee_count)
        FROM workshop_reservations
        WHERE slot_key = NEW.slot_key
          AND status IN ('waiting_for_group', 'waiting_for_payment', 'confirmed')
      ), 0) + NEW.attendee_count
    ) > COALESCE(
      (
        SELECT NULLIF(CAST(json_extract(slot.value, '$.capacity') AS INTEGER), 0)
        FROM workshops AS workshop, json_each(workshop.schedule_slots_json) AS slot
        WHERE workshop.slug = NEW.workshop_slug
          AND json_extract(slot.value, '$.key') = NEW.slot_key
        LIMIT 1
      ),
      (SELECT NULLIF(max_participants, 0) FROM workshop_booking_configs WHERE workshop_slug = NEW.workshop_slug),
      (SELECT NULLIF(max_capacity, 0) FROM workshops WHERE slug = NEW.workshop_slug),
      1
    )
    THEN RAISE(ABORT, 'workshop_capacity_exceeded')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_workshop_reservations_capacity_update
BEFORE UPDATE OF slot_key, attendee_count, status ON workshop_reservations
WHEN NEW.status IN ('waiting_for_group', 'waiting_for_payment', 'confirmed')
BEGIN
  SELECT CASE
    WHEN (
      COALESCE((
        SELECT SUM(attendee_count)
        FROM workshop_reservations
        WHERE slot_key = NEW.slot_key
          AND id <> OLD.id
          AND status IN ('waiting_for_group', 'waiting_for_payment', 'confirmed')
      ), 0) + NEW.attendee_count
    ) > COALESCE(
      (
        SELECT NULLIF(CAST(json_extract(slot.value, '$.capacity') AS INTEGER), 0)
        FROM workshops AS workshop, json_each(workshop.schedule_slots_json) AS slot
        WHERE workshop.slug = NEW.workshop_slug
          AND json_extract(slot.value, '$.key') = NEW.slot_key
        LIMIT 1
      ),
      (SELECT NULLIF(max_participants, 0) FROM workshop_booking_configs WHERE workshop_slug = NEW.workshop_slug),
      (SELECT NULLIF(max_capacity, 0) FROM workshops WHERE slug = NEW.workshop_slug),
      1
    )
    THEN RAISE(ABORT, 'workshop_capacity_exceeded')
  END;
END;