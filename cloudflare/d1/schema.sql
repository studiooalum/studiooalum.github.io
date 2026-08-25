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

CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token_hash, revoked_at);

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
  categories_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_newsletter_posts_status_published
  ON newsletter_posts(status, published_at DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  subscribed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repair_requests (
  id TEXT PRIMARY KEY,
  request_number TEXT NOT NULL UNIQUE,
  submission_id TEXT,
  submission_fingerprint TEXT NOT NULL DEFAULT '',
  customer_id TEXT,
  country_code TEXT NOT NULL DEFAULT '',
  shipping_address TEXT NOT NULL DEFAULT '',
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
  final_amount INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  bank_account TEXT NOT NULL DEFAULT '',
  payment_instructions TEXT NOT NULL DEFAULT '',
  payment_confirmed_at TEXT,
  carrier TEXT NOT NULL DEFAULT '',
  tracking_number TEXT NOT NULL DEFAULT '',
  tracking_url TEXT NOT NULL DEFAULT '',
  quoted_at TEXT,
  accepted_at TEXT,
  completed_at TEXT,
  archived_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(customer_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_repair_requests_status_created
  ON repair_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_requests_email
  ON repair_requests(email_normalized, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_requests_archive_candidate
  ON repair_requests(archive_consent_at, status, completed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_requests_submission_id
  ON repair_requests(submission_id)
  WHERE submission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_repair_requests_customer
  ON repair_requests(customer_id, created_at DESC);

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

CREATE TABLE IF NOT EXISTS repair_gallery_images (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT '',
  methods_json TEXT NOT NULL DEFAULT '[]',
  average_rgb TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repair_gallery_status_sort
  ON repair_gallery_images(status, sort_order, created_at DESC);

CREATE TABLE IF NOT EXISTS repair_events (
  id TEXT PRIMARY KEY,
  repair_request_id TEXT NOT NULL,
  request_version INTEGER,
  event_type TEXT NOT NULL,
  previous_status TEXT,
  next_status TEXT,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(repair_request_id) REFERENCES repair_requests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_repair_events_request_created
  ON repair_events(repair_request_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_events_request_version
  ON repair_events(repair_request_id, request_version)
  WHERE request_version IS NOT NULL;

CREATE TABLE IF NOT EXISTS repair_notification_templates (
  event_type TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'customer',
  subject_template TEXT NOT NULL,
  body_text_template TEXT NOT NULL,
  body_html_template TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(event_type, audience)
);

INSERT OR IGNORE INTO repair_notification_templates (
  event_type, audience, subject_template, body_text_template, body_html_template, created_at, updated_at
) VALUES
  (
    'repair.received',
    'customer',
    '[Studio OALUM] 수선 신청 완료 {requestNumber}',
    '{customerName}님, 수선 신청이 완료되었습니다.\n\n접수번호: {requestNumber}\n제품: {itemType}\n보내실 곳: {shippingAddress}\n\n진행 상태는 아래 링크에서 확인하실 수 있습니다.\n{ticketUrl}',
    '<h2>수선 신청이 완료되었습니다.</h2><p>{customerName}님, 신청해주셔서 감사합니다.</p><p><strong>접수번호</strong> {requestNumber}<br><strong>제품</strong> {itemType}</p><p><strong>보내실 곳</strong><br>{shippingAddress}</p><p><a href="{ticketUrl}">수선 진행 상태 확인</a></p>',
    '2026-08-23T00:00:00.000Z',
    '2026-08-23T00:00:00.000Z'
  ),
  (
    'repair.received',
    'admin',
    '[Repair] 새 수선 의뢰 {requestNumber}',
    '새 수선 의뢰가 접수되었습니다.\n\n접수번호: {requestNumber}\n고객명: {customerName}\n제품: {itemType}\n관리: {ticketUrl}',
    '<h2>새 수선 의뢰</h2><p><strong>접수번호</strong> {requestNumber}<br><strong>고객명</strong> {customerName}<br><strong>제품</strong> {itemType}</p><p><a href="{ticketUrl}">관리자에서 확인</a></p>',
    '2026-08-23T00:00:00.000Z',
    '2026-08-23T00:00:00.000Z'
  ),
  (
    'repair.item_received',
    'customer',
    '[Studio OALUM] 수선제품 수신 완료 {requestNumber}',
    '{customerName}님, 보내주신 {itemType} 제품을 정상적으로 받았습니다. 상태를 확인한 뒤 다음 절차를 안내드리겠습니다.\n\n진행 상태: {ticketUrl}',
    '<h2>수선제품을 정상적으로 받았습니다.</h2><p>{customerName}님, 보내주신 <strong>{itemType}</strong> 제품을 확인했습니다.</p><p>상태를 살펴본 뒤 다음 절차를 안내드리겠습니다.</p><p><a href="{ticketUrl}">수선 진행 상태 확인</a></p>',
    '2026-08-23T00:00:00.000Z',
    '2026-08-23T00:00:00.000Z'
  ),
  (
    'repair.in_progress',
    'customer',
    '[Studio OALUM] 수선 진행 중 {requestNumber}',
    '{customerName}님의 {itemType} 수선 작업이 진행 중입니다. 정성껏 작업한 뒤 완료 소식을 안내드리겠습니다.\n\n진행 상태: {ticketUrl}',
    '<h2>수선 작업이 진행 중입니다.</h2><p>{customerName}님의 <strong>{itemType}</strong> 수선 작업을 진행하고 있습니다.</p><p>작업을 마친 뒤 완료 소식을 안내드리겠습니다.</p><p><a href="{ticketUrl}">수선 진행 상태 확인</a></p>',
    '2026-08-23T00:00:00.000Z',
    '2026-08-23T00:00:00.000Z'
  ),
  (
    'repair.payment_pending',
    'customer',
    '[Studio OALUM] 수선 완료 및 입금 안내 {requestNumber}',
    '{customerName}님, {itemType} 수선이 완료되었습니다.\n\n최종 금액: {finalAmount}\n입금 안내: {bankAccount}\n{paymentInstructions}\n\n확인: {ticketUrl}',
    '<h2>수선이 완료되었습니다.</h2><p>{customerName}님의 <strong>{itemType}</strong> 수선을 마쳤습니다.</p><p><strong>최종 금액</strong> {finalAmount}<br><strong>입금 안내</strong> {bankAccount}</p><p>{paymentInstructions}</p><p><a href="{ticketUrl}">수선 내역 확인</a></p>',
    '2026-08-23T00:00:00.000Z',
    '2026-08-23T00:00:00.000Z'
  ),
  (
    'repair.shipping',
    'customer',
    '[Studio OALUM] 입금 확인 및 배송 안내 {requestNumber}',
    '{customerName}님, 입금을 확인했으며 수선 제품을 발송했습니다.\n\n택배사: {carrier}\n운송장 번호: {trackingNumber}\n배송 조회: {trackingUrl}\n\nStudio OALUM을 이용해주셔서 감사합니다.',
    '<h2>수선 제품을 발송했습니다.</h2><p>{customerName}님, 입금을 확인했습니다. Studio OALUM을 이용해주셔서 감사합니다.</p><p><strong>택배사</strong> {carrier}<br><strong>운송장 번호</strong> {trackingNumber}</p><p><a href="{trackingUrl}">배송 조회</a></p>',
    '2026-08-23T00:00:00.000Z',
    '2026-08-23T00:00:00.000Z'
  ),
  (
    'repair.closed',
    'customer',
    '[Studio OALUM] 수선 배송 완료 {requestNumber}',
    '{customerName}님, 수선 제품의 배송이 완료되었습니다. 완료된 수선 내역은 읽기 전용 Archive에서 확인하실 수 있습니다.\n\nArchive: {ticketUrl}',
    '<h2>수선 배송이 완료되었습니다.</h2><p>{customerName}님, 이용해주셔서 감사합니다.</p><p>완료된 수선 내역은 읽기 전용 Archive로 보관됩니다.</p><p><a href="{ticketUrl}">수선 Archive 확인</a></p>',
    '2026-08-23T00:00:00.000Z',
    '2026-08-23T00:00:00.000Z'
  ),
  (
    'repair.customer_inquiry',
    'admin',
    '[Repair 문의] {requestNumber} · {customerName}',
    '고객 문의가 등록되었습니다.\n\n접수번호: {requestNumber}\n고객명: {customerName}\n문의 내용:\n{inquiryMessage}\n\n문의 시각: {inquiryCreatedAt}\n관리: {ticketUrl}',
    '<h2>수선 고객 문의</h2><p><strong>접수번호</strong> {requestNumber}<br><strong>고객명</strong> {customerName}<br><strong>문의 시각</strong> {inquiryCreatedAt}</p><p><strong>문의 내용</strong><br>{inquiryMessage}</p><p><a href="{ticketUrl}">관리자에서 확인</a></p>',
    '2026-08-23T00:00:00.000Z',
    '2026-08-23T00:00:00.000Z'
  );

CREATE TABLE IF NOT EXISTS repair_notification_outbox (
  id TEXT PRIMARY KEY,
  repair_request_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email' CHECK(channel = 'email'),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'sent', 'failed', 'unknown', 'dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  locked_at TEXT,
  locked_by TEXT,
  provider_message_id TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT,
  FOREIGN KEY(repair_request_id) REFERENCES repair_requests(id) ON DELETE CASCADE,
  FOREIGN KEY(event_id) REFERENCES repair_events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_repair_outbox_due
  ON repair_notification_outbox(status, available_at, created_at);
CREATE INDEX IF NOT EXISTS idx_repair_outbox_request
  ON repair_notification_outbox(repair_request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS repair_customer_inquiries (
  id TEXT PRIMARY KEY,
  repair_request_id TEXT NOT NULL,
  rate_bucket TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(repair_request_id) REFERENCES repair_requests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_repair_inquiries_request_created
  ON repair_customer_inquiries(repair_request_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_inquiries_request_bucket
  ON repair_customer_inquiries(repair_request_id, rate_bucket);

CREATE TABLE IF NOT EXISTS guest_lookup_tokens (
  token_hash TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL CHECK(resource_type IN ('order', 'workshop', 'repair')),
  resource_id TEXT NOT NULL,
  reference TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_accessed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_guest_lookup_tokens_resource
  ON guest_lookup_tokens(resource_type, resource_id, expires_at);

CREATE TABLE IF NOT EXISTS guest_lookup_attempts (
  id TEXT PRIMARY KEY,
  client_key TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  succeeded INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_guest_lookup_attempts_client_time
  ON guest_lookup_attempts(client_key, attempted_at DESC);

CREATE TABLE IF NOT EXISTS guest_lookup_rate_slots (
  client_key TEXT NOT NULL,
  window_bucket TEXT NOT NULL,
  slot INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(client_key, window_bucket, slot)
);

CREATE INDEX IF NOT EXISTS idx_guest_lookup_rate_slots_created
  ON guest_lookup_rate_slots(created_at);

CREATE TABLE IF NOT EXISTS repair_tickets (
  id TEXT PRIMARY KEY,
  repair_id TEXT NOT NULL UNIQUE,
  customer_id TEXT,
  guest_access_token_hash TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
  unread_customer_count INTEGER NOT NULL DEFAULT 0,
  unread_admin_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(repair_id) REFERENCES repair_requests(id) ON DELETE CASCADE,
  FOREIGN KEY(customer_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_repair_tickets_customer
  ON repair_tickets(customer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_tickets_status_updated
  ON repair_tickets(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS repair_ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  client_message_id TEXT UNIQUE,
  source_event_id TEXT UNIQUE,
  author_type TEXT NOT NULL CHECK(author_type IN ('customer', 'admin', 'system')),
  body TEXT NOT NULL,
  message_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  read_at TEXT,
  FOREIGN KEY(ticket_id) REFERENCES repair_tickets(id) ON DELETE CASCADE,
  FOREIGN KEY(source_event_id) REFERENCES repair_events(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_repair_ticket_messages_ticket_created
  ON repair_ticket_messages(ticket_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_repair_ticket_messages_unread
  ON repair_ticket_messages(ticket_id, author_type, read_at, created_at);

CREATE TABLE IF NOT EXISTS repair_ticket_message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT '',
  byte_size INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(message_id) REFERENCES repair_ticket_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_repair_ticket_attachments_message
  ON repair_ticket_message_attachments(message_id, sort_order, created_at ASC);

CREATE TABLE IF NOT EXISTS repair_ticket_rate_slots (
  ticket_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  client_key TEXT NOT NULL,
  window_bucket TEXT NOT NULL,
  slot INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(ticket_id, actor_type, client_key, window_bucket, slot),
  FOREIGN KEY(ticket_id) REFERENCES repair_tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_repair_ticket_rate_slots_created
  ON repair_ticket_rate_slots(created_at);

CREATE TABLE IF NOT EXISTS repair_ticket_abuse_log (
  id TEXT PRIMARY KEY,
  ticket_id TEXT,
  actor_type TEXT NOT NULL,
  client_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(ticket_id) REFERENCES repair_tickets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_repair_ticket_abuse_created
  ON repair_ticket_abuse_log(created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_repair_ticket_messages_open_insert
BEFORE INSERT ON repair_ticket_messages
WHEN (SELECT status FROM repair_tickets WHERE id = NEW.ticket_id) <> 'open'
BEGIN
  SELECT RAISE(ABORT, 'repair_ticket_closed');
END;

CREATE TABLE IF NOT EXISTS notification_templates (
  template_key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('email', 'sms')),
  area TEXT NOT NULL CHECK(area IN ('shop', 'workshop', 'repair', 'ticket')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  trigger_label TEXT NOT NULL DEFAULT '',
  active_subject TEXT NOT NULL DEFAULT '',
  active_body TEXT NOT NULL,
  draft_subject TEXT NOT NULL DEFAULT '',
  draft_body TEXT NOT NULL,
  default_subject TEXT NOT NULL DEFAULT '',
  default_body TEXT NOT NULL,
  allowed_variables_json TEXT NOT NULL DEFAULT '[]',
  required_variables_json TEXT NOT NULL DEFAULT '[]',
  max_length INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  activated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(template_key, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_templates_area_channel
  ON notification_templates(area, channel, is_enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS notification_template_revisions (
  id TEXT PRIMARY KEY,
  template_key TEXT NOT NULL,
  channel TEXT NOT NULL,
  action TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  is_enabled INTEGER NOT NULL,
  actor_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY(template_key, channel) REFERENCES notification_templates(template_key, channel) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_revisions_template_created
  ON notification_template_revisions(template_key, channel, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('email', 'sms')),
  recipient TEXT NOT NULL,
  template_key TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  subject TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'sent', 'failed', 'unknown', 'dead_letter')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  locked_at TEXT,
  locked_by TEXT,
  provider_message_id TEXT,
  last_error TEXT,
  fallback_outbox_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT,
  FOREIGN KEY(template_key, channel) REFERENCES notification_templates(template_key, channel),
  FOREIGN KEY(fallback_outbox_id) REFERENCES notification_outbox(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_due
  ON notification_outbox(status, available_at, created_at);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_entity
  ON notification_outbox(entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS repair_studio_content (
  id TEXT PRIMARY KEY CHECK(id = 'default'),
  title TEXT NOT NULL,
  lead TEXT NOT NULL,
  body_json TEXT NOT NULL DEFAULT '[]',
  cta_label TEXT NOT NULL,
  is_published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

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

INSERT OR IGNORE INTO repair_studio_content (
  id, title, lead, body_json, cta_label, is_published, created_at, updated_at
) VALUES (
  'default',
  'Repair Studio',
  '스튜디오 오알룸은 1:1 맞춤 수선 의뢰를 받고 있습니다.',
  '["수선 방법은 옷마다 다르게 고민합니다.","Visible Mending과 한국적인 누비, 손바느질의 질감을 함께 씁니다.","옷 전체의 형태와 소재, 손상 원인을 살펴본 뒤 수선 방법을 제안합니다.","상담을 원하시는 경우, 수선 신청하기를 눌러주세요."]',
  '수선 신청하기',
  1,
  '2026-08-23T00:00:00.000Z',
  '2026-08-23T00:00:00.000Z'
);

WITH template_seed(
  template_key, channel, area, name, description, trigger_label,
  subject, body, allowed_variables_json, required_variables_json, max_length, is_enabled
) AS (
  VALUES
    ('shop.order_completed','email','shop','주문 완료','주문 결제가 완료되었을 때 보내는 이메일입니다.','결제 완료','[Studio OALUM] 주문이 완료되었습니다','{{customer_name}}님의 주문 {{order_number}}이 완료되었습니다.','["customer_name","order_number","order_url"]','["customer_name","order_number"]',0,1),
    ('shop.shipping_started','email','shop','상품 배송 시작','주문 상품 발송 시 보내는 이메일입니다.','배송 시작','[Studio OALUM] 상품이 발송되었습니다','{{customer_name}}님, 주문 {{order_number}}이 발송되었습니다. {{tracking_url}}','["customer_name","order_number","tracking_number","tracking_url"]','["customer_name","order_number"]',0,1),
    ('shop.order_cancelled','email','shop','주문 취소','주문 취소 완료 시 보내는 이메일입니다.','주문 취소','[Studio OALUM] 주문이 취소되었습니다','{{customer_name}}님의 주문 {{order_number}}이 취소되었습니다.','["customer_name","order_number","order_url"]','["customer_name","order_number"]',0,1),
    ('shop.refund_completed','email','shop','환불 완료','환불 완료 시 보내는 이메일입니다.','환불 완료','[Studio OALUM] 환불이 완료되었습니다','{{customer_name}}님의 주문 {{order_number}} 환불이 완료되었습니다.','["customer_name","order_number","order_url"]','["customer_name","order_number"]',0,1),
    ('workshop.reservation_completed','email','workshop','워크숍 예약 완료','워크숍 예약 완료 안내입니다.','예약 완료','[Studio OALUM] 워크숍 예약이 완료되었습니다','{{customer_name}}님의 {{workshop_name}} 예약이 완료되었습니다.','["customer_name","workshop_name","reservation_number","workshop_url"]','["customer_name","workshop_name"]',0,1),
    ('workshop.schedule_changed','email','workshop','워크숍 일정 변경','워크숍 일정 변경 안내입니다.','일정 변경','[Studio OALUM] 워크숍 일정이 변경되었습니다','{{customer_name}}님, {{workshop_name}} 일정이 변경되었습니다. {{schedule_label}}','["customer_name","workshop_name","schedule_label","workshop_url"]','["customer_name","workshop_name","schedule_label"]',0,1),
    ('workshop.cancelled','email','workshop','워크숍 취소','워크숍 취소 안내입니다.','예약 취소','[Studio OALUM] 워크숍 예약이 취소되었습니다','{{customer_name}}님의 {{workshop_name}} 예약이 취소되었습니다.','["customer_name","workshop_name","reservation_number"]','["customer_name","workshop_name"]',0,1),
    ('workshop.payment_completed','email','workshop','워크숍 결제 완료','워크숍 결제 완료 안내입니다.','결제 완료','[Studio OALUM] 워크숍 결제가 완료되었습니다','{{customer_name}}님의 {{workshop_name}} 결제가 완료되었습니다.','["customer_name","workshop_name","reservation_number","workshop_url"]','["customer_name","workshop_name"]',0,1),
    ('repair.application_submitted','email','repair','수선 신청 완료','수선 신청 직후 안내입니다.','신청 완료','[Studio OALUM] 수선 신청이 완료되었습니다','{{customer_name}}님, {{product_name}} 수선 신청이 완료되었습니다. {{repair_number}} {{repair_ticket_url}}','["customer_name","product_name","repair_number","studio_address","repair_url","repair_ticket_url"]','["customer_name","product_name","repair_number","repair_ticket_url"]',0,1),
    ('repair.application_submitted','sms','repair','수선 신청 완료','국내 고객에게 보내는 수선 신청 문자입니다.','신청 완료','','[OALUM] {{customer_name}}님 수선 신청 완료. {{repair_number}} {{repair_ticket_url}}','["customer_name","repair_number","repair_ticket_url"]','["customer_name","repair_number","repair_ticket_url"]',2000,1),
    ('repair.received','email','repair','수선 제품 수신 완료','수선 제품 도착 확인 안내입니다.','제품 수신','[Studio OALUM] 수선 제품을 받았습니다','{{customer_name}}님, {{product_name}} 제품을 정상적으로 받았습니다. {{repair_ticket_url}}','["customer_name","product_name","repair_number","repair_ticket_url"]','["customer_name","product_name","repair_ticket_url"]',0,1),
    ('repair.received','sms','repair','수선 제품 수신 완료','국내 고객 제품 수신 문자입니다.','제품 수신','','[OALUM] {{customer_name}}님 수선 제품을 받았습니다. {{repair_ticket_url}}','["customer_name","repair_ticket_url"]','["customer_name","repair_ticket_url"]',2000,1),
    ('repair.repair_completed_quote_ready','email','repair','수선 완료 및 가격 안내','수선 완료 후 최종 가격 안내입니다.','수선 완료','[Studio OALUM] 수선 완료 및 결제 안내','{{customer_name}}님, 수선이 완료되었습니다. {{final_amount}} {{repair_ticket_url}}','["customer_name","product_name","repair_number","final_amount","repair_ticket_url"]','["customer_name","final_amount","repair_ticket_url"]',0,1),
    ('repair.repair_completed_quote_ready','sms','repair','수선 완료 및 가격 안내','국내 고객 수선 완료 문자입니다.','수선 완료','','[OALUM] {{customer_name}}님 수선 완료. {{final_amount}} {{repair_ticket_url}}','["customer_name","final_amount","repair_ticket_url"]','["customer_name","final_amount","repair_ticket_url"]',2000,1),
    ('repair.payment_confirmed_shipping_started','email','repair','입금 확인 및 배송 시작','입금 확인과 배송을 한 번에 안내합니다.','입금 확인 및 배송','[Studio OALUM] 입금 확인 및 배송 안내','{{customer_name}}님, 입금을 확인하고 발송했습니다. {{tracking_number}} {{tracking_url}} {{repair_ticket_url}}','["customer_name","product_name","repair_number","tracking_number","tracking_url","repair_ticket_url"]','["customer_name","tracking_number","repair_ticket_url"]',0,1),
    ('repair.payment_confirmed_shipping_started','sms','repair','입금 확인 및 배송 시작','입금 확인과 배송을 한 문자로 안내합니다.','입금 확인 및 배송','','[OALUM] {{customer_name}}님 입금 확인 및 배송 시작. {{tracking_number}} {{tracking_url}} {{repair_ticket_url}}','["customer_name","tracking_number","tracking_url","repair_ticket_url"]','["customer_name","tracking_number","repair_ticket_url"]',2000,1),
    ('repair.delivered_closed','email','repair','수선 배송 완료','Ticket 종료 안내입니다.','배송 완료','[Studio OALUM] 수선 배송이 완료되었습니다','{{customer_name}}님, 배송이 완료되었습니다. {{repair_ticket_url}}','["customer_name","repair_number","repair_ticket_url"]','["customer_name","repair_ticket_url"]',0,0),
    ('ticket.customer_message_to_admin','email','ticket','고객 티켓 메시지 알림','고객 메시지를 관리자에게 알립니다.','고객 메시지','[Repair Ticket] 고객 메시지가 등록되었습니다','{{repair_number}} Ticket에 고객 메시지가 등록되었습니다. {{repair_status}} {{repair_ticket_url}}','["repair_number","repair_status","repair_ticket_url"]','["repair_number","repair_status","repair_ticket_url"]',0,1),
    ('ticket.admin_message_to_customer','email','ticket','관리자 티켓 답변 알림','관리자 답변을 고객에게 알립니다.','관리자 메시지','[Studio OALUM] Repair Ticket에 새 답변이 있습니다','{{customer_name}}님, 새 답변이 등록되었습니다. {{repair_status}} {{repair_ticket_url}}','["customer_name","repair_number","repair_status","repair_ticket_url"]','["customer_name","repair_status","repair_ticket_url"]',0,1),
    ('ticket.system_message_to_customer','email','ticket','수선 상태 안내','milestone 외 상태 변경 안내입니다.','상태 변경','[Studio OALUM] 수선 상태가 업데이트되었습니다','{{customer_name}}님, 상태가 {{repair_status}}로 변경되었습니다. {{repair_ticket_url}}','["customer_name","repair_number","repair_status","repair_ticket_url"]','["customer_name","repair_status","repair_ticket_url"]',0,1)
)
INSERT OR IGNORE INTO notification_templates (
  template_key, channel, area, name, description, trigger_label,
  active_subject, active_body, draft_subject, draft_body,
  default_subject, default_body, allowed_variables_json, required_variables_json,
  max_length, is_enabled, activated_at, created_at, updated_at
)
SELECT
  template_key, channel, area, name, description, trigger_label,
  subject, body, subject, body, subject, body,
  allowed_variables_json, required_variables_json, max_length, is_enabled,
  CASE WHEN is_enabled = 1 THEN '2026-08-23T00:00:00.000Z' ELSE NULL END,
  '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'
FROM template_seed;

UPDATE notification_templates
SET is_enabled = 0,
    activated_at = NULL,
    description = CASE
      WHEN instr(description, '기존 발송 경로') > 0 THEN description
      ELSE description || ' 기존 발송 경로를 유지하는 전환 준비 템플릿입니다.'
    END
WHERE area IN ('shop', 'workshop');

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