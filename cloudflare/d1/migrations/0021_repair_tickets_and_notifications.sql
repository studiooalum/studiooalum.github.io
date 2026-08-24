ALTER TABLE repair_requests ADD COLUMN customer_id TEXT;
ALTER TABLE repair_requests ADD COLUMN country_code TEXT NOT NULL DEFAULT '';

UPDATE repair_requests
SET customer_id = (
  SELECT users.id
  FROM users
  WHERE users.email_normalized = repair_requests.email_normalized
  LIMIT 1
)
WHERE customer_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_repair_requests_customer
  ON repair_requests(customer_id, created_at DESC);

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

INSERT OR IGNORE INTO repair_tickets (
  id, repair_id, customer_id, status, unread_customer_count, unread_admin_count,
  last_message_at, closed_at, created_at, updated_at
)
SELECT
  'RPT_' || hex(randomblob(16)),
  id,
  customer_id,
  CASE WHEN status = 'closed' THEN 'closed' ELSE 'open' END,
  0,
  0,
  updated_at,
  CASE WHEN status = 'closed' THEN COALESCE(closed_at, updated_at) ELSE NULL END,
  created_at,
  updated_at
FROM repair_requests;

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

INSERT OR IGNORE INTO repair_ticket_messages (
  id, ticket_id, client_message_id, author_type, body, message_hash, created_at
)
SELECT
  'RTM_' || hex(randomblob(16)),
  ticket.id,
  'legacy-inquiry:' || inquiry.id,
  'customer',
  inquiry.message,
  '',
  inquiry.created_at
FROM repair_customer_inquiries AS inquiry
INNER JOIN repair_tickets AS ticket ON ticket.repair_id = inquiry.repair_request_id;

UPDATE repair_tickets
SET unread_admin_count = (
      SELECT COUNT(*)
      FROM repair_ticket_messages
      WHERE repair_ticket_messages.ticket_id = repair_tickets.id
        AND repair_ticket_messages.author_type = 'customer'
        AND repair_ticket_messages.read_at IS NULL
    ),
    last_message_at = COALESCE((
      SELECT MAX(created_at)
      FROM repair_ticket_messages
      WHERE repair_ticket_messages.ticket_id = repair_tickets.id
    ), last_message_at);

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

INSERT OR IGNORE INTO repair_studio_content (
  id, title, lead, body_json, cta_label, is_published, created_at, updated_at
) VALUES (
  'default',
  'Repair Studio',
  '스튜디오 오알룸은 1:1 맞춤 수선 의뢰를 받고 있습니다.',
  '["수선 방법은 옷마다 다르게 고민합니다. 어떤 부위는 일부러 눈에 띄는 실 색으로 대담한 스티치를 넣어 하나의 디자인 요소로 드러내고, 어떤 부위는 원단과 최대한 가까운 색의 실로 섬세하게 스티치를 넣어 티가 나지 않도록 작업합니다. 손바느질, 머신 봉제, 패치워크, 데님 패치, 누비 스티치, 원단 이어 붙이기 등 상황에 맞는 방법을 그때그때 선택합니다.","특히 Visible Mending(보이는 수선)을 중요하게 생각하며, 보로·사시코 같은 전통 수선에서 영감을 받되 한국적인 누비와 손바느질의 질감, 현대적인 리페어 디자인을 함께 씁니다.","수선을 맡기실 때는 단순히 이 구멍을 어떻게 막을까만 보지 않습니다. 옷 전체의 형태와 소재, 손상된 이유, 힘이 많이 들어가는 부위, 앞으로도 계속 입을 수 있을지를 함께 살펴본 뒤 방법을 제안해 드립니다.","상담을 원하시는 경우, 수선 신청하기를 눌러주세요."]',
  '수선 신청하기',
  1,
  '2026-08-23T00:00:00.000Z',
  '2026-08-23T00:00:00.000Z'
);

INSERT OR IGNORE INTO notification_templates (
  template_key, channel, area, name, description, trigger_label,
  active_subject, active_body, draft_subject, draft_body,
  default_subject, default_body, allowed_variables_json, required_variables_json,
  max_length, is_enabled, activated_at, created_at, updated_at
) VALUES
  ('shop.order_completed', 'email', 'shop', '주문 완료', '주문 결제가 완료되었을 때 보내는 이메일입니다.', '결제 완료', '[Studio OALUM] 주문이 완료되었습니다', '{{customer_name}}님의 주문 {{order_number}}이 완료되었습니다.', '[Studio OALUM] 주문이 완료되었습니다', '{{customer_name}}님의 주문 {{order_number}}이 완료되었습니다.', '[Studio OALUM] 주문이 완료되었습니다', '{{customer_name}}님의 주문 {{order_number}}이 완료되었습니다.', '["customer_name","order_number","order_url"]', '["customer_name","order_number"]', 0, 1, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'),
  ('shop.shipping_started', 'email', 'shop', '상품 배송 시작', '주문 상품 발송 시 보내는 이메일입니다.', '배송 시작', '[Studio OALUM] 상품이 발송되었습니다', '{{customer_name}}님, 주문 {{order_number}}이 발송되었습니다. 배송 조회: {{tracking_url}}', '[Studio OALUM] 상품이 발송되었습니다', '{{customer_name}}님, 주문 {{order_number}}이 발송되었습니다. 배송 조회: {{tracking_url}}', '[Studio OALUM] 상품이 발송되었습니다', '{{customer_name}}님, 주문 {{order_number}}이 발송되었습니다. 배송 조회: {{tracking_url}}', '["customer_name","order_number","tracking_number","tracking_url"]', '["customer_name","order_number"]', 0, 1, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'),
  ('shop.order_cancelled', 'email', 'shop', '주문 취소', '주문 취소 완료 시 보내는 이메일입니다.', '주문 취소', '[Studio OALUM] 주문이 취소되었습니다', '{{customer_name}}님의 주문 {{order_number}}이 취소되었습니다.', '[Studio OALUM] 주문이 취소되었습니다', '{{customer_name}}님의 주문 {{order_number}}이 취소되었습니다.', '[Studio OALUM] 주문이 취소되었습니다', '{{customer_name}}님의 주문 {{order_number}}이 취소되었습니다.', '["customer_name","order_number","order_url"]', '["customer_name","order_number"]', 0, 1, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'),
  ('shop.refund_completed', 'email', 'shop', '환불 완료', '환불 완료 시 보내는 이메일입니다.', '환불 완료', '[Studio OALUM] 환불이 완료되었습니다', '{{customer_name}}님의 주문 {{order_number}} 환불이 완료되었습니다.', '[Studio OALUM] 환불이 완료되었습니다', '{{customer_name}}님의 주문 {{order_number}} 환불이 완료되었습니다.', '[Studio OALUM] 환불이 완료되었습니다', '{{customer_name}}님의 주문 {{order_number}} 환불이 완료되었습니다.', '["customer_name","order_number","order_url"]', '["customer_name","order_number"]', 0, 1, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'),
  ('workshop.reservation_completed', 'email', 'workshop', '워크숍 예약 완료', '워크숍 예약 완료 안내입니다.', '예약 완료', '[Studio OALUM] 워크숍 예약이 완료되었습니다', '{{customer_name}}님의 {{workshop_name}} 예약이 완료되었습니다.', '[Studio OALUM] 워크숍 예약이 완료되었습니다', '{{customer_name}}님의 {{workshop_name}} 예약이 완료되었습니다.', '[Studio OALUM] 워크숍 예약이 완료되었습니다', '{{customer_name}}님의 {{workshop_name}} 예약이 완료되었습니다.', '["customer_name","workshop_name","reservation_number","workshop_url"]', '["customer_name","workshop_name"]', 0, 1, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'),
  ('workshop.schedule_changed', 'email', 'workshop', '워크숍 일정 변경', '워크숍 일정 변경 안내입니다.', '일정 변경', '[Studio OALUM] 워크숍 일정이 변경되었습니다', '{{customer_name}}님, {{workshop_name}} 일정이 변경되었습니다. {{schedule_label}}', '[Studio OALUM] 워크숍 일정이 변경되었습니다', '{{customer_name}}님, {{workshop_name}} 일정이 변경되었습니다. {{schedule_label}}', '[Studio OALUM] 워크숍 일정이 변경되었습니다', '{{customer_name}}님, {{workshop_name}} 일정이 변경되었습니다. {{schedule_label}}', '["customer_name","workshop_name","schedule_label","workshop_url"]', '["customer_name","workshop_name","schedule_label"]', 0, 1, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'),
  ('workshop.cancelled', 'email', 'workshop', '워크숍 취소', '워크숍 취소 안내입니다.', '예약 취소', '[Studio OALUM] 워크숍 예약이 취소되었습니다', '{{customer_name}}님의 {{workshop_name}} 예약이 취소되었습니다.', '[Studio OALUM] 워크숍 예약이 취소되었습니다', '{{customer_name}}님의 {{workshop_name}} 예약이 취소되었습니다.', '[Studio OALUM] 워크숍 예약이 취소되었습니다', '{{customer_name}}님의 {{workshop_name}} 예약이 취소되었습니다.', '["customer_name","workshop_name","reservation_number"]', '["customer_name","workshop_name"]', 0, 1, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'),
  ('workshop.payment_completed', 'email', 'workshop', '워크숍 결제 완료', '워크숍 결제 완료 안내입니다.', '결제 완료', '[Studio OALUM] 워크숍 결제가 완료되었습니다', '{{customer_name}}님의 {{workshop_name}} 결제가 완료되었습니다.', '[Studio OALUM] 워크숍 결제가 완료되었습니다', '{{customer_name}}님의 {{workshop_name}} 결제가 완료되었습니다.', '[Studio OALUM] 워크숍 결제가 완료되었습니다', '{{customer_name}}님의 {{workshop_name}} 결제가 완료되었습니다.', '["customer_name","workshop_name","reservation_number","workshop_url"]', '["customer_name","workshop_name"]', 0, 1, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'),
  ('repair.application_submitted', 'email', 'repair', '수선 신청 완료', '수선 신청 직후 안내입니다.', '신청 완료', '[Studio OALUM] 수선 신청이 완료되었습니다', '{{customer_name}}님, {{product_name}} 수선 신청이 완료되었습니다. 수선 번호: {{repair_number}}. 티켓: {{repair_ticket_url}}', '[Studio OALUM] 수선 신청이 완료되었습니다', '{{customer_name}}님, {{product_name}} 수선 신청이 완료되었습니다. 수선 번호: {{repair_number}}. 티켓: {{repair_ticket_url}}', '[Studio OALUM] 수선 신청이 완료되었습니다', '{{customer_name}}님, {{product_name}} 수선 신청이 완료되었습니다. 수선 번호: {{repair_number}}. 티켓: {{repair_ticket_url}}', '["customer_name","product_name","repair_number","studio_address","repair_url","repair_ticket_url"]', '["customer_name","product_name","repair_number","repair_ticket_url"]', 0, 1, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'),
  ('repair.application_submitted', 'sms', 'repair', '수선 신청 완료', '국내 고객에게 보내는 수선 신청 문자입니다.', '신청 완료', '', '[OALUM] {{customer_name}}님 수선 신청 완료. 번호 {{repair_number}} {{repair_ticket_url}}', '', '[OALUM] {{customer_name}}님 수선 신청 완료. 번호 {{repair_number}} {{repair_ticket_url}}', '', '[OALUM] {{customer_name}}님 수선 신청 완료. 번호 {{repair_number}} {{repair_ticket_url}}', '["customer_name","repair_number","repair_ticket_url"]', '["customer_name","repair_number","repair_ticket_url"]', 2000, 1, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'),
  ('repair.received', 'email', 'repair', '수선 제품 수신 완료', '수선 제품 도착 확인 안내입니다.', '제품 수신', '[Studio OALUM] 수선 제품을 받았습니다', '{{customer_name}}님, {{product_name}} 제품을 정상적으로 받았습니다. 티켓: {{repair_ticket_url}}', '[Studio OALUM] 수선 제품을 받았습니다', '{{customer_name}}님, {{product_name}} 제품을 정상적으로 받았습니다. 티켓: {{repair_ticket_url}}', '[Studio OALUM] 수선 제품을 받았습니다', '{{customer_name}}님, {{product_name}} 제품을 정상적으로 받았습니다. 티켓: {{repair_ticket_url}}', '["customer_name","product_name","repair_number","repair_ticket_url"]', '["customer_name","product_name","repair_ticket_url"]', 0, 1, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'),
  ('repair.received', 'sms', 'repair', '수선 제품 수신 완료', '국내 고객 제품 수신 문자입니다.', '제품 수신', '', '[OALUM] {{customer_name}}님 수선 제품을 정상적으로 받았습니다. {{repair_ticket_url}}', '', '[OALUM] {{customer_name}}님 수선 제품을 정상적으로 받았습니다. {{repair_ticket_url}}', '', '[OALUM] {{customer_name}}님 수선 제품을 정상적으로 받았습니다. {{repair_ticket_url}}', '["customer_name","repair_ticket_url"]', '["customer_name","repair_ticket_url"]', 2000, 1, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'),
  ('repair.repair_completed_quote_ready', 'email', 'repair', '수선 완료 및 가격 안내', '수선 완료 후 최종 가격 안내입니다.', '수선 완료', '[Studio OALUM] 수선 완료 및 결제 안내', '{{customer_name}}님, {{product_name}} 수선이 완료되었습니다. 최종 가격 {{final_amount}}. 티켓: {{repair_ticket_url}}', '[Studio OALUM] 수선 완료 및 결제 안내', '{{customer_name}}님, {{product_name}} 수선이 완료되었습니다. 최종 가격 {{final_amount}}. 티켓: {{repair_ticket_url}}', '[Studio OALUM] 수선 완료 및 결제 안내', '{{customer_name}}님, {{product_name}} 수선이 완료되었습니다. 최종 가격 {{final_amount}}. 티켓: {{repair_ticket_url}}', '["customer_name","product_name","repair_number","final_amount","repair_ticket_url"]', '["customer_name","product_name","final_amount","repair_ticket_url"]', 0, 1, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'),
  ('repair.repair_completed_quote_ready', 'sms', 'repair', '수선 완료 및 가격 안내', '국내 고객 수선 완료 문자입니다.', '수선 완료', '', '[OALUM] {{customer_name}}님 수선 완료. 최종 가격 {{final_amount}} {{repair_ticket_url}}', '', '[OALUM] {{customer_name}}님 수선 완료. 최종 가격 {{final_amount}} {{repair_ticket_url}}', '', '[OALUM] {{customer_name}}님 수선 완료. 최종 가격 {{final_amount}} {{repair_ticket_url}}', '["customer_name","final_amount","repair_ticket_url"]', '["customer_name","final_amount","repair_ticket_url"]', 2000, 1, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'),
  ('repair.payment_confirmed_shipping_started', 'email', 'repair', '입금 확인 및 배송 시작', '입금 확인·배송 시작·운송장을 한 번에 안내합니다.', '입금 확인 및 배송', '[Studio OALUM] 입금 확인 및 배송 안내', '{{customer_name}}님, 입금을 확인하고 {{product_name}} 제품을 발송했습니다. 운송장 {{tracking_number}} · 배송 조회 {{tracking_url}} · 티켓 {{repair_ticket_url}}. 감사합니다.', '[Studio OALUM] 입금 확인 및 배송 안내', '{{customer_name}}님, 입금을 확인하고 {{product_name}} 제품을 발송했습니다. 운송장 {{tracking_number}} · 배송 조회 {{tracking_url}} · 티켓 {{repair_ticket_url}}. 감사합니다.', '[Studio OALUM] 입금 확인 및 배송 안내', '{{customer_name}}님, 입금을 확인하고 {{product_name}} 제품을 발송했습니다. 운송장 {{tracking_number}} · 배송 조회 {{tracking_url}} · 티켓 {{repair_ticket_url}}. 감사합니다.', '["customer_name","product_name","repair_number","tracking_number","tracking_url","repair_ticket_url"]', '["customer_name","tracking_number","repair_ticket_url"]', 0, 1, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'),
  ('repair.payment_confirmed_shipping_started', 'sms', 'repair', '입금 확인 및 배송 시작', '입금 확인·배송 시작·운송장을 한 문자로 안내합니다.', '입금 확인 및 배송', '', '[OALUM] {{customer_name}}님 입금 확인 및 배송 시작. 운송장 {{tracking_number}} {{tracking_url}} 수선 티켓 {{repair_ticket_url}} 감사합니다.', '', '[OALUM] {{customer_name}}님 입금 확인 및 배송 시작. 운송장 {{tracking_number}} {{tracking_url}} 수선 티켓 {{repair_ticket_url}} 감사합니다.', '', '[OALUM] {{customer_name}}님 입금 확인 및 배송 시작. 운송장 {{tracking_number}} {{tracking_url}} 수선 티켓 {{repair_ticket_url}} 감사합니다.', '["customer_name","tracking_number","tracking_url","repair_ticket_url"]', '["customer_name","tracking_number","repair_ticket_url"]', 2000, 1, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'),
  ('repair.delivered_closed', 'email', 'repair', '수선 배송 완료', '현재는 티켓 종료 시스템 메시지로 안내하며 직접 발송은 비활성화됩니다.', '배송 완료', '[Studio OALUM] 수선 배송이 완료되었습니다', '{{customer_name}}님, 수선 배송이 완료되었습니다. 기록은 {{repair_ticket_url}}에서 확인할 수 있습니다.', '[Studio OALUM] 수선 배송이 완료되었습니다', '{{customer_name}}님, 수선 배송이 완료되었습니다. 기록은 {{repair_ticket_url}}에서 확인할 수 있습니다.', '[Studio OALUM] 수선 배송이 완료되었습니다', '{{customer_name}}님, 수선 배송이 완료되었습니다. 기록은 {{repair_ticket_url}}에서 확인할 수 있습니다.', '["customer_name","repair_number","repair_ticket_url"]', '["customer_name","repair_ticket_url"]', 0, 0, NULL, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'),
  ('ticket.customer_message_to_admin', 'email', 'ticket', '고객 티켓 메시지 알림', '고객이 새 메시지를 남기면 관리자에게 알립니다.', '고객 메시지', '[Repair Ticket] 고객 메시지가 등록되었습니다', '{{repair_number}} 티켓에 고객 메시지가 등록되었습니다. 현재 상태: {{repair_status}}. 티켓: {{repair_ticket_url}}', '[Repair Ticket] 고객 메시지가 등록되었습니다', '{{repair_number}} 티켓에 고객 메시지가 등록되었습니다. 현재 상태: {{repair_status}}. 티켓: {{repair_ticket_url}}', '[Repair Ticket] 고객 메시지가 등록되었습니다', '{{repair_number}} 티켓에 고객 메시지가 등록되었습니다. 현재 상태: {{repair_status}}. 티켓: {{repair_ticket_url}}', '["repair_number","repair_status","repair_ticket_url"]', '["repair_number","repair_status","repair_ticket_url"]', 0, 1, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'),
  ('ticket.admin_message_to_customer', 'email', 'ticket', '관리자 티켓 답변 알림', '관리자가 새 메시지를 남기면 고객에게 알립니다.', '관리자 메시지', '[Studio OALUM] Repair Ticket에 새 답변이 있습니다', '{{customer_name}}님, Repair Ticket에 새 답변이 등록되었습니다. 현재 상태: {{repair_status}}. 티켓: {{repair_ticket_url}}', '[Studio OALUM] Repair Ticket에 새 답변이 있습니다', '{{customer_name}}님, Repair Ticket에 새 답변이 등록되었습니다. 현재 상태: {{repair_status}}. 티켓: {{repair_ticket_url}}', '[Studio OALUM] Repair Ticket에 새 답변이 있습니다', '{{customer_name}}님, Repair Ticket에 새 답변이 등록되었습니다. 현재 상태: {{repair_status}}. 티켓: {{repair_ticket_url}}', '["customer_name","repair_number","repair_status","repair_ticket_url"]', '["customer_name","repair_status","repair_ticket_url"]', 0, 1, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z'),
  ('ticket.system_message_to_customer', 'email', 'ticket', '수선 상태 안내', 'milestone 외 상태 변경을 Ticket 이메일로 안내합니다.', '상태 변경', '[Studio OALUM] 수선 상태가 업데이트되었습니다', '{{customer_name}}님, 수선 상태가 {{repair_status}}로 변경되었습니다. 티켓: {{repair_ticket_url}}', '[Studio OALUM] 수선 상태가 업데이트되었습니다', '{{customer_name}}님, 수선 상태가 {{repair_status}}로 변경되었습니다. 티켓: {{repair_ticket_url}}', '[Studio OALUM] 수선 상태가 업데이트되었습니다', '{{customer_name}}님, 수선 상태가 {{repair_status}}로 변경되었습니다. 티켓: {{repair_ticket_url}}', '["customer_name","repair_number","repair_status","repair_ticket_url"]', '["customer_name","repair_status","repair_ticket_url"]', 0, 1, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z');