ALTER TABLE repair_requests ADD COLUMN submission_id TEXT;
ALTER TABLE repair_requests ADD COLUMN submission_fingerprint TEXT NOT NULL DEFAULT '';
ALTER TABLE repair_requests ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE repair_requests ADD COLUMN bank_account TEXT NOT NULL DEFAULT '';
ALTER TABLE repair_requests ADD COLUMN payment_instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE repair_requests ADD COLUMN payment_confirmed_at TEXT;
ALTER TABLE repair_requests ADD COLUMN carrier TEXT NOT NULL DEFAULT '';
ALTER TABLE repair_requests ADD COLUMN tracking_number TEXT NOT NULL DEFAULT '';
ALTER TABLE repair_requests ADD COLUMN tracking_url TEXT NOT NULL DEFAULT '';
ALTER TABLE repair_requests ADD COLUMN closed_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_requests_submission_id
  ON repair_requests(submission_id)
  WHERE submission_id IS NOT NULL;

UPDATE repair_requests
SET status = 'closed',
    closed_at = COALESCE(NULLIF(archived_at, ''), NULLIF(completed_at, ''), updated_at)
WHERE status = 'archived'
   OR (status = 'completed' AND archived_at IS NOT NULL AND archived_at <> '');

UPDATE repair_requests
SET status = CASE status
  WHEN 'reviewing' THEN 'item_received'
  WHEN 'quoted' THEN 'item_received'
  WHEN 'approved' THEN 'in_progress'
  WHEN 'completed' THEN 'payment_pending'
  ELSE status
END;

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