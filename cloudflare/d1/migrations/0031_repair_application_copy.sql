UPDATE notification_templates
SET name = '수선 접수 완료',
    description = '수선 신청 직후 고객에게 보내는 상세 안내입니다.',
    trigger_label = '접수 완료',
    active_subject = '[Studio OALUM] 수선 접수가 완료되었습니다',
    active_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      'Studio OALUM에 {{product_name}} 수선을 신청해주셔서 감사합니다.' || char(10) ||
      '보내주신 내용을 정상적으로 접수했습니다.' || char(10) || char(10) ||
      '제품 보내실 곳' || char(10) || '{{studio_address}}' || char(10) || char(10) ||
      '제품이 도착하면 상태를 확인한 뒤 수선 가능 여부와 진행 방향을 안내드리겠습니다.' || char(10) || char(10) ||
      '신청 내용 확인과 메시지는 아래 수선 접수 페이지에서 이용하실 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '실제 수선을 시작할 때 수선 티켓 번호가 발급됩니다.' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    draft_subject = '[Studio OALUM] 수선 접수가 완료되었습니다',
    draft_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      'Studio OALUM에 {{product_name}} 수선을 신청해주셔서 감사합니다.' || char(10) ||
      '보내주신 내용을 정상적으로 접수했습니다.' || char(10) || char(10) ||
      '제품 보내실 곳' || char(10) || '{{studio_address}}' || char(10) || char(10) ||
      '제품이 도착하면 상태를 확인한 뒤 수선 가능 여부와 진행 방향을 안내드리겠습니다.' || char(10) || char(10) ||
      '신청 내용 확인과 메시지는 아래 수선 접수 페이지에서 이용하실 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '실제 수선을 시작할 때 수선 티켓 번호가 발급됩니다.' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    default_subject = '[Studio OALUM] 수선 접수가 완료되었습니다',
    default_body = '안녕하세요, {{customer_name}}님.' || char(10) || char(10) ||
      'Studio OALUM에 {{product_name}} 수선을 신청해주셔서 감사합니다.' || char(10) ||
      '보내주신 내용을 정상적으로 접수했습니다.' || char(10) || char(10) ||
      '제품 보내실 곳' || char(10) || '{{studio_address}}' || char(10) || char(10) ||
      '제품이 도착하면 상태를 확인한 뒤 수선 가능 여부와 진행 방향을 안내드리겠습니다.' || char(10) || char(10) ||
      '신청 내용 확인과 메시지는 아래 수선 접수 페이지에서 이용하실 수 있습니다.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '실제 수선을 시작할 때 수선 티켓 번호가 발급됩니다.' || char(10) || char(10) ||
      '감사합니다.' || char(10) || 'Studio OALUM',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE template_key = 'repair.application_submitted' AND channel = 'email';

UPDATE notification_templates
SET name = '수선 접수 완료',
    description = '국내 고객에게 보내는 수선 접수 문자입니다.',
    trigger_label = '접수 완료',
    active_body = '[Studio OALUM 수선 안내]' || char(10) ||
      '{{customer_name}}님, 수선 신청을 정상적으로 접수했습니다.' || char(10) || char(10) ||
      '제품을 보내실 주소와 이후 안내는 아래 수선 접수 페이지에서 확인해주세요.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '수선을 시작할 때 티켓 번호가 발급됩니다.',
    draft_body = '[Studio OALUM 수선 안내]' || char(10) ||
      '{{customer_name}}님, 수선 신청을 정상적으로 접수했습니다.' || char(10) || char(10) ||
      '제품을 보내실 주소와 이후 안내는 아래 수선 접수 페이지에서 확인해주세요.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '수선을 시작할 때 티켓 번호가 발급됩니다.',
    default_body = '[Studio OALUM 수선 안내]' || char(10) ||
      '{{customer_name}}님, 수선 신청을 정상적으로 접수했습니다.' || char(10) || char(10) ||
      '제품을 보내실 주소와 이후 안내는 아래 수선 접수 페이지에서 확인해주세요.' || char(10) ||
      '{{repair_ticket_url}}' || char(10) || char(10) ||
      '수선을 시작할 때 티켓 번호가 발급됩니다.',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE template_key = 'repair.application_submitted' AND channel = 'sms';

UPDATE notification_templates
SET name = '새 수선 접수 · 관리자',
    description = '고객이 수선 신청을 완료하면 관리자에게 보내는 필수 알림입니다.',
    trigger_label = '접수 완료',
    active_subject = '[Repair] 새 수선 접수 · {{customer_name}}',
    draft_subject = '[Repair] 새 수선 접수 · {{customer_name}}',
    default_subject = '[Repair] 새 수선 접수 · {{customer_name}}',
    active_body = replace(active_body, '새 수선 문의가 접수되었습니다.', '새 수선 접수가 완료되었습니다.'),
    draft_body = replace(draft_body, '새 수선 문의가 접수되었습니다.', '새 수선 접수가 완료되었습니다.'),
    default_body = replace(default_body, '새 수선 문의가 접수되었습니다.', '새 수선 접수가 완료되었습니다.'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE template_key = 'repair.application_submitted_admin' AND channel = 'email';

UPDATE notification_templates
SET active_body = replace(active_body, '수선 문의 페이지', '수선 접수 페이지'),
    draft_body = replace(draft_body, '수선 문의 페이지', '수선 접수 페이지'),
    default_body = replace(default_body, '수선 문의 페이지', '수선 접수 페이지'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE template_key = 'repair.received' AND channel = 'email';
