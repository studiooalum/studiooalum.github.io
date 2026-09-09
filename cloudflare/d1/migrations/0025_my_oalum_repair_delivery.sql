ALTER TABLE repair_requests ADD COLUMN ticket_number INTEGER;
ALTER TABLE repair_tickets ADD COLUMN short_code TEXT;

CREATE TABLE IF NOT EXISTS repair_ticket_number_sequence (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  next_number INTEGER NOT NULL CHECK(next_number > 0)
);

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS ticket_number
  FROM repair_requests
)
UPDATE repair_requests
SET ticket_number = (
  SELECT numbered.ticket_number
  FROM numbered
  WHERE numbered.id = repair_requests.id
)
WHERE ticket_number IS NULL;

UPDATE repair_tickets
SET short_code = lower(substr(hex(randomblob(16)), 1, 12))
WHERE short_code IS NULL OR short_code = '';

INSERT OR IGNORE INTO repair_ticket_number_sequence (id, next_number) VALUES (1, 1);

UPDATE repair_ticket_number_sequence
SET next_number = MAX(
  next_number,
  (SELECT COALESCE(MAX(ticket_number), 0) + 1 FROM repair_requests)
)
WHERE id = 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_requests_ticket_number
  ON repair_requests(ticket_number)
  WHERE ticket_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_tickets_short_code
  ON repair_tickets(short_code)
  WHERE short_code IS NOT NULL AND short_code <> '';

CREATE TRIGGER IF NOT EXISTS trg_repair_requests_ticket_number_required
BEFORE INSERT ON repair_requests
WHEN NEW.ticket_number IS NULL
BEGIN
  SELECT RAISE(ABORT, 'repair_ticket_number_required');
END;

INSERT OR IGNORE INTO notification_templates (
  template_key, channel, area, name, description, trigger_label,
  active_subject, active_body, draft_subject, draft_body,
  default_subject, default_body, allowed_variables_json, required_variables_json,
  max_length, is_enabled, activated_at, created_at, updated_at
) VALUES (
  'repair.application_submitted_admin',
  'email',
  'repair',
  '새 수선 신청 · 관리자',
  '새 수선 신청이 접수되면 관리자에게 고객 정보와 Repair Ticket 링크를 전달합니다.',
  '신청 완료',
  '[Studio OALUM] 새 수선 신청 {{repair_number}}',
  '새 수선 신청이 접수되었습니다.\n\n고객명: {{customer_name}}\n이메일: {{customer_email}}\n연락처: {{customer_phone}}\n제품: {{product_name}}\n신청 내용: {{repair_details}}\n\nRepair Ticket에서 신청 내용을 확인해주세요.\n{{repair_ticket_url}}',
  '[Studio OALUM] 새 수선 신청 {{repair_number}}',
  '새 수선 신청이 접수되었습니다.\n\n고객명: {{customer_name}}\n이메일: {{customer_email}}\n연락처: {{customer_phone}}\n제품: {{product_name}}\n신청 내용: {{repair_details}}\n\nRepair Ticket에서 신청 내용을 확인해주세요.\n{{repair_ticket_url}}',
  '[Studio OALUM] 새 수선 신청 {{repair_number}}',
  '새 수선 신청이 접수되었습니다.\n\n고객명: {{customer_name}}\n이메일: {{customer_email}}\n연락처: {{customer_phone}}\n제품: {{product_name}}\n신청 내용: {{repair_details}}\n\nRepair Ticket에서 신청 내용을 확인해주세요.\n{{repair_ticket_url}}',
  '["customer_name","customer_email","customer_phone","product_name","repair_number","repair_details","repair_ticket_url"]',
  '["customer_name","customer_email","customer_phone","product_name","repair_number","repair_details","repair_ticket_url"]',
  0,
  1,
  '2026-09-09T00:00:00.000Z',
  '2026-09-09T00:00:00.000Z',
  '2026-09-09T00:00:00.000Z'
);