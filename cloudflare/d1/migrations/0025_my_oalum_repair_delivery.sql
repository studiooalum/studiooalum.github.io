ALTER TABLE repair_requests ADD COLUMN ticket_number INTEGER;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS value
  FROM repair_requests
)
UPDATE repair_requests
SET ticket_number = (SELECT value FROM numbered WHERE numbered.id = repair_requests.id)
WHERE ticket_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_requests_ticket_number
  ON repair_requests(ticket_number)
  WHERE ticket_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS repair_ticket_number_sequence (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  next_number INTEGER NOT NULL CHECK(next_number > 0)
);

INSERT OR REPLACE INTO repair_ticket_number_sequence (id, next_number)
SELECT 1, COALESCE(MAX(ticket_number), 0) + 1 FROM repair_requests;

CREATE TRIGGER IF NOT EXISTS trg_repair_requests_ticket_number
AFTER INSERT ON repair_requests
WHEN NEW.ticket_number IS NULL
BEGIN
  UPDATE repair_requests
  SET ticket_number = COALESCE((SELECT MAX(ticket_number) FROM repair_requests WHERE id <> NEW.id), 0) + 1
  WHERE id = NEW.id;
  UPDATE repair_ticket_number_sequence
  SET next_number = MAX(next_number, (SELECT ticket_number + 1 FROM repair_requests WHERE id = NEW.id))
  WHERE id = 1;
END;

ALTER TABLE repair_tickets ADD COLUMN short_code TEXT;

UPDATE repair_tickets
SET short_code = lower(hex(randomblob(9)))
WHERE short_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_tickets_short_code
  ON repair_tickets(short_code)
  WHERE short_code IS NOT NULL;

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
  '고객이 수선 신청을 완료하면 관리자에게 보내는 필수 알림입니다.',
  '신청 완료',
  '[Repair] 새 수선 신청 {{repair_number}} · {{customer_name}}',
  '새 수선 신청이 접수되었습니다.' || char(10) || char(10) ||
  '티켓 번호: {{repair_number}}' || char(10) ||
  '고객명: {{customer_name}}' || char(10) ||
  '이메일: {{customer_email}}' || char(10) ||
  '연락처: {{customer_phone}}' || char(10) ||
  '제품: {{product_name}}' || char(10) ||
  '고객 발송지: {{shipping_address}}' || char(10) || char(10) ||
  '수선 요청' || char(10) || '{{repair_request}}' || char(10) || char(10) ||
  '아래 Repair Ticket에서 신청 사진과 상세 내용을 확인하고 고객에게 답변할 수 있습니다.' || char(10) ||
  '{{repair_admin_url}}',
  '[Repair] 새 수선 신청 {{repair_number}} · {{customer_name}}',
  '새 수선 신청이 접수되었습니다.' || char(10) || char(10) ||
  '티켓 번호: {{repair_number}}' || char(10) ||
  '고객명: {{customer_name}}' || char(10) ||
  '이메일: {{customer_email}}' || char(10) ||
  '연락처: {{customer_phone}}' || char(10) ||
  '제품: {{product_name}}' || char(10) ||
  '고객 발송지: {{shipping_address}}' || char(10) || char(10) ||
  '수선 요청' || char(10) || '{{repair_request}}' || char(10) || char(10) ||
  '아래 Repair Ticket에서 신청 사진과 상세 내용을 확인하고 고객에게 답변할 수 있습니다.' || char(10) ||
  '{{repair_admin_url}}',
  '[Repair] 새 수선 신청 {{repair_number}} · {{customer_name}}',
  '새 수선 신청이 접수되었습니다.' || char(10) || char(10) ||
  '티켓 번호: {{repair_number}}' || char(10) ||
  '고객명: {{customer_name}}' || char(10) ||
  '이메일: {{customer_email}}' || char(10) ||
  '연락처: {{customer_phone}}' || char(10) ||
  '제품: {{product_name}}' || char(10) ||
  '고객 발송지: {{shipping_address}}' || char(10) || char(10) ||
  '수선 요청' || char(10) || '{{repair_request}}' || char(10) || char(10) ||
  '아래 Repair Ticket에서 신청 사진과 상세 내용을 확인하고 고객에게 답변할 수 있습니다.' || char(10) ||
  '{{repair_admin_url}}',
  '["customer_name","customer_email","customer_phone","product_name","repair_number","repair_request","shipping_address","repair_ticket_url","repair_admin_url"]',
  '["customer_name","customer_email","customer_phone","product_name","repair_number","repair_request","repair_admin_url"]',
  0,
  1,
  '2026-09-09T00:00:00.000Z',
  '2026-09-09T00:00:00.000Z',
  '2026-09-09T00:00:00.000Z'
);

UPDATE notification_templates
SET active_subject = '[Studio OALUM] 수선 신청이 완료되었습니다 · {{repair_number}}',
    active_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '{{product_name}} 수선 신청이 정상적으로 접수되었습니다.' || char(10) ||
      '티켓 번호: {{repair_number}}' || char(10) || char(10) ||
      '제품을 아래 주소로 보내주세요.' || char(10) ||
      '{{studio_address}}' || char(10) || char(10) ||
      '제품이 도착하면 상태를 확인한 뒤 Repair Ticket에서 수선 방향과 진행 상황을 안내드리겠습니다.' || char(10) ||
      '아래 링크에서 신청 내용과 새 안내를 확인하고 오알룸과 메시지를 주고받을 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    draft_subject = '[Studio OALUM] 수선 신청이 완료되었습니다 · {{repair_number}}',
    draft_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '{{product_name}} 수선 신청이 정상적으로 접수되었습니다.' || char(10) ||
      '티켓 번호: {{repair_number}}' || char(10) || char(10) ||
      '제품을 아래 주소로 보내주세요.' || char(10) ||
      '{{studio_address}}' || char(10) || char(10) ||
      '제품이 도착하면 상태를 확인한 뒤 Repair Ticket에서 수선 방향과 진행 상황을 안내드리겠습니다.' || char(10) ||
      '아래 링크에서 신청 내용과 새 안내를 확인하고 오알룸과 메시지를 주고받을 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    default_subject = '[Studio OALUM] 수선 신청이 완료되었습니다 · {{repair_number}}',
    default_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '{{product_name}} 수선 신청이 정상적으로 접수되었습니다.' || char(10) ||
      '티켓 번호: {{repair_number}}' || char(10) || char(10) ||
      '제품을 아래 주소로 보내주세요.' || char(10) ||
      '{{studio_address}}' || char(10) || char(10) ||
      '제품이 도착하면 상태를 확인한 뒤 Repair Ticket에서 수선 방향과 진행 상황을 안내드리겠습니다.' || char(10) ||
      '아래 링크에서 신청 내용과 새 안내를 확인하고 오알룸과 메시지를 주고받을 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    allowed_variables_json = '["customer_name","product_name","repair_number","studio_address","repair_url","repair_ticket_url"]',
    required_variables_json = '["customer_name","product_name","repair_number","studio_address","repair_ticket_url"]',
    updated_at = '2026-09-09T00:00:00.000Z'
WHERE template_key = 'repair.application_submitted' AND channel = 'email';

UPDATE notification_templates
SET active_body = '[OALUM] {{customer_name}}님, 수선 신청이 완료되었습니다. 티켓 {{repair_number}}에서 접수 내용과 진행 상황을 확인해주세요: {{repair_ticket_url}}',
    draft_body = '[OALUM] {{customer_name}}님, 수선 신청이 완료되었습니다. 티켓 {{repair_number}}에서 접수 내용과 진행 상황을 확인해주세요: {{repair_ticket_url}}',
    default_body = '[OALUM] {{customer_name}}님, 수선 신청이 완료되었습니다. 티켓 {{repair_number}}에서 접수 내용과 진행 상황을 확인해주세요: {{repair_ticket_url}}',
    updated_at = '2026-09-09T00:00:00.000Z'
WHERE template_key = 'repair.application_submitted' AND channel = 'sms';

UPDATE notification_templates
SET active_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '{{product_name}} 수선 제품을 정상적으로 받았습니다.' || char(10) ||
      '제품 상태를 확인한 뒤 다음 수선 절차를 Repair Ticket으로 안내드리겠습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) || '감사합니다.' || char(10) || 'Studio OALUM',
    draft_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '{{product_name}} 수선 제품을 정상적으로 받았습니다.' || char(10) ||
      '제품 상태를 확인한 뒤 다음 수선 절차를 Repair Ticket으로 안내드리겠습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) || '감사합니다.' || char(10) || 'Studio OALUM',
    default_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '{{product_name}} 수선 제품을 정상적으로 받았습니다.' || char(10) ||
      '제품 상태를 확인한 뒤 다음 수선 절차를 Repair Ticket으로 안내드리겠습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) || '감사합니다.' || char(10) || 'Studio OALUM',
    updated_at = '2026-09-09T00:00:00.000Z'
WHERE template_key = 'repair.received' AND channel = 'email';

UPDATE notification_templates
SET active_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '{{product_name}} 수선 작업이 완료되었습니다.' || char(10) ||
      '최종 가격: {{final_amount}}' || char(10) || char(10) ||
      '결제 안내와 완료 사진은 Repair Ticket에서 확인해주세요.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) || '감사합니다.' || char(10) || 'Studio OALUM',
    draft_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '{{product_name}} 수선 작업이 완료되었습니다.' || char(10) ||
      '최종 가격: {{final_amount}}' || char(10) || char(10) ||
      '결제 안내와 완료 사진은 Repair Ticket에서 확인해주세요.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) || '감사합니다.' || char(10) || 'Studio OALUM',
    default_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '{{product_name}} 수선 작업이 완료되었습니다.' || char(10) ||
      '최종 가격: {{final_amount}}' || char(10) || char(10) ||
      '결제 안내와 완료 사진은 Repair Ticket에서 확인해주세요.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) || '감사합니다.' || char(10) || 'Studio OALUM',
    updated_at = '2026-09-09T00:00:00.000Z'
WHERE template_key = 'repair.repair_completed_quote_ready' AND channel = 'email';

UPDATE notification_templates
SET active_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '입금을 확인했으며 {{product_name}} 수선 제품의 배송을 시작했습니다.' || char(10) ||
      '운송장 번호: {{tracking_number}}' || char(10) ||
      '배송 조회: {{tracking_url}}' || char(10) || char(10) ||
      '수선 기록과 배송 정보는 Repair Ticket에서도 확인할 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) || '감사합니다.' || char(10) || 'Studio OALUM',
    draft_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '입금을 확인했으며 {{product_name}} 수선 제품의 배송을 시작했습니다.' || char(10) ||
      '운송장 번호: {{tracking_number}}' || char(10) ||
      '배송 조회: {{tracking_url}}' || char(10) || char(10) ||
      '수선 기록과 배송 정보는 Repair Ticket에서도 확인할 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) || '감사합니다.' || char(10) || 'Studio OALUM',
    default_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '입금을 확인했으며 {{product_name}} 수선 제품의 배송을 시작했습니다.' || char(10) ||
      '운송장 번호: {{tracking_number}}' || char(10) ||
      '배송 조회: {{tracking_url}}' || char(10) || char(10) ||
      '수선 기록과 배송 정보는 Repair Ticket에서도 확인할 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) || '감사합니다.' || char(10) || 'Studio OALUM',
    updated_at = '2026-09-09T00:00:00.000Z'
WHERE template_key = 'repair.payment_confirmed_shipping_started' AND channel = 'email';

WITH email_copy(template_key, body) AS (
  VALUES
    (
      'repair.delivered_closed',
      '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '수선 제품의 배송이 완료되었습니다.' || char(10) ||
      '완료된 수선 내용과 오알룸과 나눈 대화는 Repair Ticket에 읽기 전용 기록으로 보관됩니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      'Studio OALUM을 이용해주셔서 감사합니다.'
    ),
    (
      'ticket.customer_message_to_admin',
      'Repair Ticket {{repair_number}}에 고객 메시지가 등록되었습니다.' || char(10) ||
      '현재 상태: {{repair_status}}' || char(10) || char(10) ||
      '아래 관리자 화면에서 메시지를 확인하고 답변해주세요.' || char(10) ||
      '{{repair_admin_url}}'
    ),
    (
      'ticket.admin_message_to_customer',
      '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      'Repair Ticket {{repair_number}}에 Studio OALUM의 새 답변이 등록되었습니다.' || char(10) ||
      '현재 상태: {{repair_status}}' || char(10) || char(10) ||
      '아래 티켓에서 답변을 확인하고 메시지를 남길 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM'
    ),
    (
      'ticket.system_message_to_customer',
      '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      'Repair Ticket {{repair_number}}의 수선 상태가 업데이트되었습니다.' || char(10) ||
      '현재 상태: {{repair_status}}' || char(10) || char(10) ||
      '상세 내용과 다음 안내는 아래 티켓에서 확인해주세요.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM'
    )
)
UPDATE notification_templates
SET active_body = (SELECT body FROM email_copy WHERE email_copy.template_key = notification_templates.template_key),
    draft_body = (SELECT body FROM email_copy WHERE email_copy.template_key = notification_templates.template_key),
    default_body = (SELECT body FROM email_copy WHERE email_copy.template_key = notification_templates.template_key),
    updated_at = '2026-09-09T00:00:00.000Z'
WHERE channel = 'email' AND template_key IN (SELECT template_key FROM email_copy);

UPDATE notification_templates
SET allowed_variables_json = '["repair_number","repair_status","repair_ticket_url","repair_admin_url"]',
    required_variables_json = '["repair_number","repair_status","repair_admin_url"]',
    updated_at = '2026-09-09T00:00:00.000Z'
WHERE template_key = 'ticket.customer_message_to_admin' AND channel = 'email';

WITH sms_copy(template_key, body) AS (
  VALUES
    ('repair.received', '[OALUM] {{customer_name}}님, 수선 제품을 잘 받았습니다. 제품 확인 후 다음 절차를 티켓으로 안내드리겠습니다: {{repair_ticket_url}}'),
    ('repair.repair_completed_quote_ready', '[OALUM] {{customer_name}}님, 수선이 완료되었습니다. 최종 가격은 {{final_amount}}이며 결제 안내와 완료 사진은 티켓에서 확인해주세요: {{repair_ticket_url}}'),
    ('repair.payment_confirmed_shipping_started', '[OALUM] {{customer_name}}님, 입금을 확인하고 수선 제품을 발송했습니다. 운송장 {{tracking_number}} / 배송과 수선 기록: {{repair_ticket_url}}')
)
UPDATE notification_templates
SET active_body = (SELECT body FROM sms_copy WHERE sms_copy.template_key = notification_templates.template_key),
    draft_body = (SELECT body FROM sms_copy WHERE sms_copy.template_key = notification_templates.template_key),
    default_body = (SELECT body FROM sms_copy WHERE sms_copy.template_key = notification_templates.template_key),
    updated_at = '2026-09-09T00:00:00.000Z'
WHERE channel = 'sms' AND template_key IN (SELECT template_key FROM sms_copy);
