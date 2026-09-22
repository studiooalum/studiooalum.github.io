UPDATE notification_templates
SET active_body = replace(
      active_body,
      '보내주신 내용을 정상적으로 접수했습니다.',
      '보내주신 내용을 정상적으로 접수했습니다.' || char(10) || '수선 접수 조회번호: {{repair_number}}'
    ),
    draft_body = replace(
      draft_body,
      '보내주신 내용을 정상적으로 접수했습니다.',
      '보내주신 내용을 정상적으로 접수했습니다.' || char(10) || '수선 접수 조회번호: {{repair_number}}'
    ),
    default_body = replace(
      default_body,
      '보내주신 내용을 정상적으로 접수했습니다.',
      '보내주신 내용을 정상적으로 접수했습니다.' || char(10) || '수선 접수 조회번호: {{repair_number}}'
    ),
    required_variables_json = '["customer_name","product_name","repair_number","studio_address","repair_ticket_url"]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE template_key = 'repair.application_submitted' AND channel = 'email';

UPDATE notification_templates
SET active_body = replace(
      active_body,
      '{{customer_name}}님, 수선 신청을 정상적으로 접수했습니다.',
      '{{customer_name}}님, 수선 신청을 정상적으로 접수했습니다.' || char(10) || '조회번호: {{repair_number}}'
    ),
    draft_body = replace(
      draft_body,
      '{{customer_name}}님, 수선 신청을 정상적으로 접수했습니다.',
      '{{customer_name}}님, 수선 신청을 정상적으로 접수했습니다.' || char(10) || '조회번호: {{repair_number}}'
    ),
    default_body = replace(
      default_body,
      '{{customer_name}}님, 수선 신청을 정상적으로 접수했습니다.',
      '{{customer_name}}님, 수선 신청을 정상적으로 접수했습니다.' || char(10) || '조회번호: {{repair_number}}'
    ),
    required_variables_json = '["customer_name","repair_number","repair_ticket_url"]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE template_key = 'repair.application_submitted' AND channel = 'sms';
