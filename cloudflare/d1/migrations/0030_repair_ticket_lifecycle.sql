-- Repair inquiries do not receive a public ticket number until work starts.
-- The business ledger is authoritative through #004, so untouched inquiries
-- above that point return their prematurely allocated numbers to the sequence.

DROP TRIGGER IF EXISTS trg_repair_requests_ticket_number;

UPDATE repair_requests
SET ticket_number = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE ticket_number > 4
  AND status IN ('received', 'item_received', 'rejected', 'cancelled');

INSERT OR IGNORE INTO repair_ticket_number_sequence (id, next_number) VALUES (1, 5);
UPDATE repair_ticket_number_sequence
SET next_number = MAX(
  5,
  COALESCE((SELECT MAX(ticket_number) + 1 FROM repair_requests WHERE ticket_number IS NOT NULL), 5)
)
WHERE id = 1;

UPDATE notification_templates
SET active_subject = '[Studio OALUM] 수선 문의가 접수되었습니다',
    active_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      'Studio OALUM에 {{product_name}} 수선을 문의해주셔서 감사합니다.' || char(10) ||
      '보내주신 내용을 정상적으로 접수했습니다.' || char(10) || char(10) ||
      '제품 보내실 곳' || char(10) || '{{studio_address}}' || char(10) || char(10) ||
      '제품이 도착하면 상태를 확인한 뒤 수선 가능 여부와 진행 방향을 안내드리겠습니다.' || char(10) || char(10) ||
      '신청 내용 확인과 문의는 아래 수선 문의 페이지에서 하실 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '실제 수선을 시작할 때 수선 티켓 번호가 발급됩니다.' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    draft_subject = '[Studio OALUM] 수선 문의가 접수되었습니다',
    draft_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      'Studio OALUM에 {{product_name}} 수선을 문의해주셔서 감사합니다.' || char(10) ||
      '보내주신 내용을 정상적으로 접수했습니다.' || char(10) || char(10) ||
      '제품 보내실 곳' || char(10) || '{{studio_address}}' || char(10) || char(10) ||
      '제품이 도착하면 상태를 확인한 뒤 수선 가능 여부와 진행 방향을 안내드리겠습니다.' || char(10) || char(10) ||
      '신청 내용 확인과 문의는 아래 수선 문의 페이지에서 하실 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '실제 수선을 시작할 때 수선 티켓 번호가 발급됩니다.' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    default_subject = '[Studio OALUM] 수선 문의가 접수되었습니다',
    default_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      'Studio OALUM에 {{product_name}} 수선을 문의해주셔서 감사합니다.' || char(10) ||
      '보내주신 내용을 정상적으로 접수했습니다.' || char(10) || char(10) ||
      '제품 보내실 곳' || char(10) || '{{studio_address}}' || char(10) || char(10) ||
      '제품이 도착하면 상태를 확인한 뒤 수선 가능 여부와 진행 방향을 안내드리겠습니다.' || char(10) || char(10) ||
      '신청 내용 확인과 문의는 아래 수선 문의 페이지에서 하실 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '실제 수선을 시작할 때 수선 티켓 번호가 발급됩니다.' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    required_variables_json = '["customer_name","product_name","studio_address","repair_ticket_url"]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE template_key = 'repair.application_submitted' AND channel = 'email';

UPDATE notification_templates
SET active_body = '[Studio OALUM 수선 안내]' || char(10) ||
      '{{customer_name}}님, 수선 문의를 정상적으로 접수했습니다.' || char(10) || char(10) ||
      '제품을 보내실 주소와 이후 안내는 아래 수선 문의 페이지에서 확인해주세요.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '수선을 시작할 때 티켓 번호가 발급됩니다.',
    draft_body = '[Studio OALUM 수선 안내]' || char(10) ||
      '{{customer_name}}님, 수선 문의를 정상적으로 접수했습니다.' || char(10) || char(10) ||
      '제품을 보내실 주소와 이후 안내는 아래 수선 문의 페이지에서 확인해주세요.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '수선을 시작할 때 티켓 번호가 발급됩니다.',
    default_body = '[Studio OALUM 수선 안내]' || char(10) ||
      '{{customer_name}}님, 수선 문의를 정상적으로 접수했습니다.' || char(10) || char(10) ||
      '제품을 보내실 주소와 이후 안내는 아래 수선 문의 페이지에서 확인해주세요.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '수선을 시작할 때 티켓 번호가 발급됩니다.',
    required_variables_json = '["customer_name","repair_ticket_url"]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE template_key = 'repair.application_submitted' AND channel = 'sms';

UPDATE notification_templates
SET active_subject = '[Studio OALUM] 수선 제품 도착 및 예상 가격 안내',
    active_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '보내주신 {{product_name}} 수선 제품을 잘 받았습니다.' || char(10) ||
      '예상 가격: {{quote_amount}}' || char(10) || char(10) ||
      '위 금액은 제품 상태와 실제 작업 범위에 따라 달라질 수 있습니다.' || char(10) ||
      '수선 진행이 확정되면 티켓 번호와 다음 절차를 안내드리겠습니다.' || char(10) || char(10) ||
      '진행 내용 확인과 문의는 아래 수선 문의 페이지에서 하실 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    draft_subject = '[Studio OALUM] 수선 제품 도착 및 예상 가격 안내',
    draft_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '보내주신 {{product_name}} 수선 제품을 잘 받았습니다.' || char(10) ||
      '예상 가격: {{quote_amount}}' || char(10) || char(10) ||
      '위 금액은 제품 상태와 실제 작업 범위에 따라 달라질 수 있습니다.' || char(10) ||
      '수선 진행이 확정되면 티켓 번호와 다음 절차를 안내드리겠습니다.' || char(10) || char(10) ||
      '진행 내용 확인과 문의는 아래 수선 문의 페이지에서 하실 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    default_subject = '[Studio OALUM] 수선 제품 도착 및 예상 가격 안내',
    default_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '보내주신 {{product_name}} 수선 제품을 잘 받았습니다.' || char(10) ||
      '예상 가격: {{quote_amount}}' || char(10) || char(10) ||
      '위 금액은 제품 상태와 실제 작업 범위에 따라 달라질 수 있습니다.' || char(10) ||
      '수선 진행이 확정되면 티켓 번호와 다음 절차를 안내드리겠습니다.' || char(10) || char(10) ||
      '진행 내용 확인과 문의는 아래 수선 문의 페이지에서 하실 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    allowed_variables_json = '["customer_name","product_name","repair_number","quote_amount","repair_ticket_url"]',
    required_variables_json = '["customer_name","product_name","quote_amount","repair_ticket_url"]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE template_key = 'repair.received' AND channel = 'email';

UPDATE notification_templates
SET active_body = '[Studio OALUM 수선 안내]' || char(10) ||
      '{{customer_name}}님, 보내주신 수선 제품을 잘 받았습니다.' || char(10) || char(10) ||
      '예상 가격: {{quote_amount}}' || char(10) ||
      '실제 작업 범위에 따라 금액이 달라질 수 있습니다.' || char(10) ||
      '확인 및 문의: {{repair_ticket_url}}',
    draft_body = '[Studio OALUM 수선 안내]' || char(10) ||
      '{{customer_name}}님, 보내주신 수선 제품을 잘 받았습니다.' || char(10) || char(10) ||
      '예상 가격: {{quote_amount}}' || char(10) ||
      '실제 작업 범위에 따라 금액이 달라질 수 있습니다.' || char(10) ||
      '확인 및 문의: {{repair_ticket_url}}',
    default_body = '[Studio OALUM 수선 안내]' || char(10) ||
      '{{customer_name}}님, 보내주신 수선 제품을 잘 받았습니다.' || char(10) || char(10) ||
      '예상 가격: {{quote_amount}}' || char(10) ||
      '실제 작업 범위에 따라 금액이 달라질 수 있습니다.' || char(10) ||
      '확인 및 문의: {{repair_ticket_url}}',
    allowed_variables_json = '["customer_name","quote_amount","repair_ticket_url"]',
    required_variables_json = '["customer_name","quote_amount","repair_ticket_url"]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE template_key = 'repair.received' AND channel = 'sms';

UPDATE notification_templates
SET active_subject = '[Repair] 새 수선 문의 · {{customer_name}}',
    active_body = '새 수선 문의가 접수되었습니다.' || char(10) ||
      '고객: {{customer_name}}' || char(10) ||
      '이메일: {{customer_email}}' || char(10) ||
      '연락처: {{customer_phone}}' || char(10) ||
      '제품: {{product_name}}' || char(10) ||
      '고객 발송지: {{shipping_address}}' || char(10) ||
      '수선 요청: {{repair_request}}' || char(10) ||
      '관리자 확인: {{repair_admin_url}}',
    draft_subject = '[Repair] 새 수선 문의 · {{customer_name}}',
    draft_body = '새 수선 문의가 접수되었습니다.' || char(10) ||
      '고객: {{customer_name}}' || char(10) ||
      '이메일: {{customer_email}}' || char(10) ||
      '연락처: {{customer_phone}}' || char(10) ||
      '제품: {{product_name}}' || char(10) ||
      '고객 발송지: {{shipping_address}}' || char(10) ||
      '수선 요청: {{repair_request}}' || char(10) ||
      '관리자 확인: {{repair_admin_url}}',
    default_subject = '[Repair] 새 수선 문의 · {{customer_name}}',
    default_body = '새 수선 문의가 접수되었습니다.' || char(10) ||
      '고객: {{customer_name}}' || char(10) ||
      '이메일: {{customer_email}}' || char(10) ||
      '연락처: {{customer_phone}}' || char(10) ||
      '제품: {{product_name}}' || char(10) ||
      '고객 발송지: {{shipping_address}}' || char(10) ||
      '수선 요청: {{repair_request}}' || char(10) ||
      '관리자 확인: {{repair_admin_url}}',
    required_variables_json = '["customer_name","customer_email","customer_phone","product_name","repair_request","repair_admin_url"]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE template_key = 'repair.application_submitted_admin' AND channel = 'email';
