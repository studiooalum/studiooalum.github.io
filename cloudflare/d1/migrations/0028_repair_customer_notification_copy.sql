-- Improve customer-facing Repair notifications without changing their delivery
-- triggers. SMS messages remain comfortably within the LMS 2,000-byte limit.

UPDATE notification_templates
SET active_subject = '[Studio OALUM] 수선 신청 접수 · {{repair_number}}',
    active_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      'Studio OALUM에 {{product_name}} 수선을 맡겨주셔서 감사합니다.' || char(10) ||
      '고객님의 수선 신청을 정상적으로 접수했습니다.' || char(10) || char(10) ||
      '접수 번호' || char(10) || '{{repair_number}}' || char(10) || char(10) ||
      '제품 보내실 곳' || char(10) || '{{studio_address}}' || char(10) || char(10) ||
      '제품이 도착하면 상태를 꼼꼼히 확인한 뒤 수선 방향과 진행 일정을 안내드리겠습니다.' || char(10) || char(10) ||
      '신청 내용 확인과 문의는 아래 Repair Ticket에서 하실 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    draft_subject = '[Studio OALUM] 수선 신청 접수 · {{repair_number}}',
    draft_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      'Studio OALUM에 {{product_name}} 수선을 맡겨주셔서 감사합니다.' || char(10) ||
      '고객님의 수선 신청을 정상적으로 접수했습니다.' || char(10) || char(10) ||
      '접수 번호' || char(10) || '{{repair_number}}' || char(10) || char(10) ||
      '제품 보내실 곳' || char(10) || '{{studio_address}}' || char(10) || char(10) ||
      '제품이 도착하면 상태를 꼼꼼히 확인한 뒤 수선 방향과 진행 일정을 안내드리겠습니다.' || char(10) || char(10) ||
      '신청 내용 확인과 문의는 아래 Repair Ticket에서 하실 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    default_subject = '[Studio OALUM] 수선 신청 접수 · {{repair_number}}',
    default_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      'Studio OALUM에 {{product_name}} 수선을 맡겨주셔서 감사합니다.' || char(10) ||
      '고객님의 수선 신청을 정상적으로 접수했습니다.' || char(10) || char(10) ||
      '접수 번호' || char(10) || '{{repair_number}}' || char(10) || char(10) ||
      '제품 보내실 곳' || char(10) || '{{studio_address}}' || char(10) || char(10) ||
      '제품이 도착하면 상태를 꼼꼼히 확인한 뒤 수선 방향과 진행 일정을 안내드리겠습니다.' || char(10) || char(10) ||
      '신청 내용 확인과 문의는 아래 Repair Ticket에서 하실 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    required_variables_json = '["customer_name","product_name","repair_number","studio_address","repair_ticket_url"]',
    updated_at = '2026-09-16T00:00:00.000Z'
WHERE template_key = 'repair.application_submitted' AND channel = 'email';

UPDATE notification_templates
SET active_subject = '[Studio OALUM] 수선 제품 도착 확인 · {{repair_number}}',
    active_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '보내주신 {{product_name}} 수선 제품을 잘 받았습니다.' || char(10) ||
      '접수 번호: {{repair_number}}' || char(10) || char(10) ||
      '현재 제품 상태와 요청 내용을 확인하고 있습니다.' || char(10) ||
      '확인을 마치면 수선 방향과 다음 절차를 Repair Ticket으로 안내드리겠습니다.' || char(10) || char(10) ||
      '진행 내용 확인과 문의는 아래 Repair Ticket에서 하실 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    draft_subject = '[Studio OALUM] 수선 제품 도착 확인 · {{repair_number}}',
    draft_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '보내주신 {{product_name}} 수선 제품을 잘 받았습니다.' || char(10) ||
      '접수 번호: {{repair_number}}' || char(10) || char(10) ||
      '현재 제품 상태와 요청 내용을 확인하고 있습니다.' || char(10) ||
      '확인을 마치면 수선 방향과 다음 절차를 Repair Ticket으로 안내드리겠습니다.' || char(10) || char(10) ||
      '진행 내용 확인과 문의는 아래 Repair Ticket에서 하실 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    default_subject = '[Studio OALUM] 수선 제품 도착 확인 · {{repair_number}}',
    default_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '보내주신 {{product_name}} 수선 제품을 잘 받았습니다.' || char(10) ||
      '접수 번호: {{repair_number}}' || char(10) || char(10) ||
      '현재 제품 상태와 요청 내용을 확인하고 있습니다.' || char(10) ||
      '확인을 마치면 수선 방향과 다음 절차를 Repair Ticket으로 안내드리겠습니다.' || char(10) || char(10) ||
      '진행 내용 확인과 문의는 아래 Repair Ticket에서 하실 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    updated_at = '2026-09-16T00:00:00.000Z'
WHERE template_key = 'repair.received' AND channel = 'email';

UPDATE notification_templates
SET active_subject = '[Studio OALUM] 수선 완료 및 결제 안내 · {{repair_number}}',
    active_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '{{product_name}} 수선 작업을 정성껏 마쳤습니다.' || char(10) ||
      '접수 번호: {{repair_number}}' || char(10) ||
      '최종 금액: {{final_amount}}' || char(10) || char(10) ||
      '완료 사진과 결제 방법은 아래 Repair Ticket에서 확인해주세요.' || char(10) ||
      '결제가 확인되면 제품을 안전하게 포장해 발송하겠습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    draft_subject = '[Studio OALUM] 수선 완료 및 결제 안내 · {{repair_number}}',
    draft_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '{{product_name}} 수선 작업을 정성껏 마쳤습니다.' || char(10) ||
      '접수 번호: {{repair_number}}' || char(10) ||
      '최종 금액: {{final_amount}}' || char(10) || char(10) ||
      '완료 사진과 결제 방법은 아래 Repair Ticket에서 확인해주세요.' || char(10) ||
      '결제가 확인되면 제품을 안전하게 포장해 발송하겠습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    default_subject = '[Studio OALUM] 수선 완료 및 결제 안내 · {{repair_number}}',
    default_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '{{product_name}} 수선 작업을 정성껏 마쳤습니다.' || char(10) ||
      '접수 번호: {{repair_number}}' || char(10) ||
      '최종 금액: {{final_amount}}' || char(10) || char(10) ||
      '완료 사진과 결제 방법은 아래 Repair Ticket에서 확인해주세요.' || char(10) ||
      '결제가 확인되면 제품을 안전하게 포장해 발송하겠습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    updated_at = '2026-09-16T00:00:00.000Z'
WHERE template_key = 'repair.repair_completed_quote_ready' AND channel = 'email';

UPDATE notification_templates
SET active_subject = '[Studio OALUM] 입금 확인 및 발송 안내 · {{repair_number}}',
    active_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '입금을 확인했으며 {{product_name}} 수선 제품을 발송했습니다.' || char(10) ||
      '접수 번호: {{repair_number}}' || char(10) ||
      '운송장 번호: {{tracking_number}}' || char(10) ||
      '배송 조회: {{tracking_url}}' || char(10) || char(10) ||
      '완료된 수선 기록과 배송 정보는 아래 Repair Ticket에서도 확인할 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      'Studio OALUM을 이용해주셔서 감사합니다.',
    draft_subject = '[Studio OALUM] 입금 확인 및 발송 안내 · {{repair_number}}',
    draft_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '입금을 확인했으며 {{product_name}} 수선 제품을 발송했습니다.' || char(10) ||
      '접수 번호: {{repair_number}}' || char(10) ||
      '운송장 번호: {{tracking_number}}' || char(10) ||
      '배송 조회: {{tracking_url}}' || char(10) || char(10) ||
      '완료된 수선 기록과 배송 정보는 아래 Repair Ticket에서도 확인할 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      'Studio OALUM을 이용해주셔서 감사합니다.',
    default_subject = '[Studio OALUM] 입금 확인 및 발송 안내 · {{repair_number}}',
    default_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '입금을 확인했으며 {{product_name}} 수선 제품을 발송했습니다.' || char(10) ||
      '접수 번호: {{repair_number}}' || char(10) ||
      '운송장 번호: {{tracking_number}}' || char(10) ||
      '배송 조회: {{tracking_url}}' || char(10) || char(10) ||
      '완료된 수선 기록과 배송 정보는 아래 Repair Ticket에서도 확인할 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      'Studio OALUM을 이용해주셔서 감사합니다.',
    updated_at = '2026-09-16T00:00:00.000Z'
WHERE template_key = 'repair.payment_confirmed_shipping_started' AND channel = 'email';

UPDATE notification_templates
SET active_subject = '[Studio OALUM] 새 답변이 도착했습니다 · {{repair_number}}',
    active_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '수선 담당자가 Repair Ticket {{repair_number}}에 새 답변을 남겼습니다.' || char(10) ||
      '현재 상태: {{repair_status}}' || char(10) || char(10) ||
      '아래 Repair Ticket에서 답변을 확인하고 추가 문의를 남기실 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    draft_subject = '[Studio OALUM] 새 답변이 도착했습니다 · {{repair_number}}',
    draft_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '수선 담당자가 Repair Ticket {{repair_number}}에 새 답변을 남겼습니다.' || char(10) ||
      '현재 상태: {{repair_status}}' || char(10) || char(10) ||
      '아래 Repair Ticket에서 답변을 확인하고 추가 문의를 남기실 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    default_subject = '[Studio OALUM] 새 답변이 도착했습니다 · {{repair_number}}',
    default_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      '수선 담당자가 Repair Ticket {{repair_number}}에 새 답변을 남겼습니다.' || char(10) ||
      '현재 상태: {{repair_status}}' || char(10) || char(10) ||
      '아래 Repair Ticket에서 답변을 확인하고 추가 문의를 남기실 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    updated_at = '2026-09-16T00:00:00.000Z'
WHERE template_key = 'ticket.admin_message_to_customer' AND channel = 'email';

UPDATE notification_templates
SET active_subject = '[Studio OALUM] 수선 상태 안내 · {{repair_number}}',
    active_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      'Repair Ticket {{repair_number}}의 수선 상태가 변경되었습니다.' || char(10) ||
      '현재 상태: {{repair_status}}' || char(10) || char(10) ||
      '변경 내용과 다음 안내는 아래 Repair Ticket에서 확인해주세요.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    draft_subject = '[Studio OALUM] 수선 상태 안내 · {{repair_number}}',
    draft_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      'Repair Ticket {{repair_number}}의 수선 상태가 변경되었습니다.' || char(10) ||
      '현재 상태: {{repair_status}}' || char(10) || char(10) ||
      '변경 내용과 다음 안내는 아래 Repair Ticket에서 확인해주세요.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    default_subject = '[Studio OALUM] 수선 상태 안내 · {{repair_number}}',
    default_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      'Repair Ticket {{repair_number}}의 수선 상태가 변경되었습니다.' || char(10) ||
      '현재 상태: {{repair_status}}' || char(10) || char(10) ||
      '변경 내용과 다음 안내는 아래 Repair Ticket에서 확인해주세요.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    updated_at = '2026-09-16T00:00:00.000Z'
WHERE template_key = 'ticket.system_message_to_customer' AND channel = 'email';

WITH sms_copy(template_key, body) AS (
  VALUES
    ('repair.application_submitted',
      '[Studio OALUM 수선 안내]' || char(10) ||
      '{{customer_name}}님, 수선 신청을 정상적으로 접수했습니다.' || char(10) || char(10) ||
      '접수 번호: {{repair_number}}' || char(10) ||
      '제품을 보내실 주소와 이후 진행 안내는 아래 수선 티켓에서 확인해주세요.' || char(10) ||
      '{{repair_ticket_url}}'),
    ('repair.received',
      '[Studio OALUM 수선 안내]' || char(10) ||
      '{{customer_name}}님, 보내주신 수선 제품을 잘 받았습니다.' || char(10) || char(10) ||
      '제품 상태를 확인한 뒤 수선 방향과 다음 절차를 안내드리겠습니다.' || char(10) ||
      '진행 내용과 문의는 아래 수선 티켓에서 확인해주세요.' || char(10) ||
      '{{repair_ticket_url}}'),
    ('repair.repair_completed_quote_ready',
      '[Studio OALUM 수선 안내]' || char(10) ||
      '{{customer_name}}님, 수선 작업을 완료했습니다.' || char(10) || char(10) ||
      '최종 금액: {{final_amount}}' || char(10) ||
      '완료 사진과 결제 안내는 아래 수선 티켓에서 확인해주세요.' || char(10) ||
      '{{repair_ticket_url}}'),
    ('repair.payment_confirmed_shipping_started',
      '[Studio OALUM 수선 안내]' || char(10) ||
      '{{customer_name}}님, 입금을 확인했으며 수선 제품을 발송했습니다.' || char(10) || char(10) ||
      '운송장 번호: {{tracking_number}}' || char(10) ||
      '배송 조회: {{tracking_url}}' || char(10) ||
      '수선 기록: {{repair_ticket_url}}' || char(10) || char(10) ||
      '감사합니다.')
)
UPDATE notification_templates
SET active_body = (SELECT body FROM sms_copy WHERE sms_copy.template_key = notification_templates.template_key),
    draft_body = (SELECT body FROM sms_copy WHERE sms_copy.template_key = notification_templates.template_key),
    default_body = (SELECT body FROM sms_copy WHERE sms_copy.template_key = notification_templates.template_key),
    updated_at = '2026-09-16T00:00:00.000Z'
WHERE channel = 'sms' AND template_key IN (SELECT template_key FROM sms_copy);
