-- Receipt only: estimate and customer message follow after inspection.
-- Preserve enabled flags, other templates, customer records, and notification history.

UPDATE notification_templates
SET active_subject = '', draft_subject = '', default_subject = '',
    active_body = '[Studio OALUM 수선 안내]
{{customer_name}}님, 보내주신 수선 제품을 잘 받았습니다.

제품 상태를 확인한 뒤 수령 후 1~2일 내 예상 가격을 별도로 안내드리겠습니다.

예상 가격과 이후 진행 안내는 아래 수선 티켓에서 확인해주세요.
{{repair_ticket_url}}', draft_body = '[Studio OALUM 수선 안내]
{{customer_name}}님, 보내주신 수선 제품을 잘 받았습니다.

제품 상태를 확인한 뒤 수령 후 1~2일 내 예상 가격을 별도로 안내드리겠습니다.

예상 가격과 이후 진행 안내는 아래 수선 티켓에서 확인해주세요.
{{repair_ticket_url}}', default_body = '[Studio OALUM 수선 안내]
{{customer_name}}님, 보내주신 수선 제품을 잘 받았습니다.

제품 상태를 확인한 뒤 수령 후 1~2일 내 예상 가격을 별도로 안내드리겠습니다.

예상 가격과 이후 진행 안내는 아래 수선 티켓에서 확인해주세요.
{{repair_ticket_url}}',
    description = '국내 고객 제품 수령 및 1~2일 내 예상 가격 별도 안내 문자입니다.', required_variables_json = '["customer_name","repair_ticket_url"]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE template_key = 'repair.received' AND channel = 'sms';

UPDATE notification_templates
SET active_subject = '[Studio OALUM] 수선 제품 수령 안내', draft_subject = '[Studio OALUM] 수선 제품 수령 안내', default_subject = '[Studio OALUM] 수선 제품 수령 안내',
    active_body = '안녕하세요, {{customer_name}}님.

보내주신 {{product_name}} 수선 제품을 잘 받았습니다.

제품 상태를 확인한 뒤 수령 후 1~2일 내 예상 가격을 별도로 안내드리겠습니다.
예상 가격과 이후 진행 안내는 아래 수선 티켓에서 확인하실 수 있습니다.
{{repair_ticket_url}}

감사합니다.
Studio OALUM', draft_body = '안녕하세요, {{customer_name}}님.

보내주신 {{product_name}} 수선 제품을 잘 받았습니다.

제품 상태를 확인한 뒤 수령 후 1~2일 내 예상 가격을 별도로 안내드리겠습니다.
예상 가격과 이후 진행 안내는 아래 수선 티켓에서 확인하실 수 있습니다.
{{repair_ticket_url}}

감사합니다.
Studio OALUM', default_body = '안녕하세요, {{customer_name}}님.

보내주신 {{product_name}} 수선 제품을 잘 받았습니다.

제품 상태를 확인한 뒤 수령 후 1~2일 내 예상 가격을 별도로 안내드리겠습니다.
예상 가격과 이후 진행 안내는 아래 수선 티켓에서 확인하실 수 있습니다.
{{repair_ticket_url}}

감사합니다.
Studio OALUM',
    description = '제품 수령 및 1~2일 내 예상 가격 별도 안내입니다.', required_variables_json = '["customer_name","product_name","repair_ticket_url"]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE template_key = 'repair.received' AND channel = 'email';
