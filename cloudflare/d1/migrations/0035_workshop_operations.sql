CREATE TABLE IF NOT EXISTS workshop_custom_content (
  id TEXT PRIMARY KEY CHECK(id = 'default'),
  image_url TEXT NOT NULL DEFAULT '',
  image_alt TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workshop_inquiries (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  attendee_count INTEGER NOT NULL CHECK(attendee_count BETWEEN 1 AND 1000),
  preferred_schedule TEXT NOT NULL,
  location_type TEXT NOT NULL CHECK(location_type IN ('studio', 'other')),
  location_detail TEXT NOT NULL DEFAULT '',
  class_content TEXT NOT NULL,
  question TEXT NOT NULL DEFAULT '',
  privacy_consent_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received', 'contacted', 'closed')),
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workshop_inquiries_status ON workshop_inquiries(status, created_at DESC);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(scope, subject_hash, bucket)
);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_expiry ON api_rate_limits(expires_at);

CREATE TRIGGER IF NOT EXISTS trg_workshop_private_slot_insert
BEFORE INSERT ON workshop_reservations
WHEN NEW.booking_type = 'daily' AND NEW.status IN ('waiting_for_payment', 'confirmed')
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM workshop_reservations WHERE slot_key = NEW.slot_key
    AND status IN ('waiting_for_group', 'waiting_for_payment', 'confirmed')
  ) THEN RAISE(ABORT, 'workshop_slot_taken') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_workshop_private_slot_update
BEFORE UPDATE OF slot_key, status ON workshop_reservations
WHEN NEW.booking_type = 'daily' AND NEW.join_policy = 'private'
  AND NEW.status IN ('waiting_for_payment', 'confirmed')
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM workshop_reservations WHERE slot_key = NEW.slot_key AND id <> OLD.id
    AND status IN ('waiting_for_group', 'waiting_for_payment', 'confirmed')
  ) THEN RAISE(ABORT, 'workshop_slot_taken') END;
END;

WITH seed(template_key, name, subject, body) AS (VALUES
  ('workshop.inquiry_received', '맞춤 워크샵 문의 접수', '[Studio OALUM] 맞춤 워크샵 문의가 접수되었습니다', '{{customer_name}}님, 맞춤 워크샵 문의가 접수되었습니다. 희망 일정: {{schedule_label}}, 인원: {{attendee_count}}명. 담당자가 확인 후 연락드리겠습니다. 이 문의는 예약 또는 결제 확정이 아닙니다.'),
  ('workshop.inquiry_received_admin', '맞춤 워크샵 신규 문의', '[Studio OALUM] 맞춤 워크샵 신규 문의', '{{customer_name}} / {{customer_email}} / {{customer_phone}}
희망 일정: {{schedule_label}}
인원: {{attendee_count}}명
{{inquiry_details}}
{{workshop_url}}')
), channels(channel) AS (VALUES ('email'), ('sms'))
INSERT OR IGNORE INTO notification_templates (
  template_key, channel, area, name, trigger_label, active_subject, active_body,
  draft_subject, draft_body, default_subject, default_body,
  allowed_variables_json, required_variables_json, max_length, is_enabled, activated_at, created_at, updated_at
)
SELECT template_key, channel, 'workshop', name, '맞춤 문의 접수', subject, body, subject, body, subject, body,
  '["customer_name","customer_email","customer_phone","schedule_label","attendee_count","inquiry_details","workshop_url"]',
  '["customer_name","schedule_label"]', CASE WHEN channel = 'sms' THEN 2000 ELSE 0 END,
  CASE WHEN channel = 'email' THEN 1 ELSE 0 END, '2026-09-24T00:00:00.000Z', '2026-09-24T00:00:00.000Z', '2026-09-24T00:00:00.000Z'
FROM seed CROSS JOIN channels;