WITH seed(template_key, area, name, body) AS (VALUES
  ('shop.order_completed','shop','주문 결제 완료','{{customer_name}}님, 주문 {{order_number}}의 결제가 완료되었습니다. 결제 금액: {{final_amount}}. 주문 내역: {{order_url}}'),
  ('shop.shipping_started','shop','상품 배송 시작','{{customer_name}}님, 주문 {{order_number}}을 발송했습니다. 운송장: {{tracking_number}}. 배송 조회: {{tracking_url}}'),
  ('shop.delivered','shop','상품 배송 완료','{{customer_name}}님, 주문 {{order_number}}의 배송이 완료되었습니다. {{order_url}}'),
  ('shop.order_cancelled','shop','주문 취소','{{customer_name}}님, 주문 {{order_number}}이 취소되었습니다. {{order_url}}'),
  ('shop.refund_completed','shop','주문 환불 완료','{{customer_name}}님, 주문 {{order_number}}의 {{final_amount}} 환불 처리가 완료되었습니다. 결제 수단에 반영되기까지 카드사 영업일이 소요될 수 있습니다. {{order_url}}'),
  ('shop.refund_completed_admin','shop','주문 환불 완료 · 관리자','주문 {{order_number}} / {{customer_name}} / {{final_amount}} 환불 완료. {{order_url}}'),
  ('workshop.reservation_received','workshop','워크샵 신청 접수','{{customer_name}}님, {{workshop_name}} 신청을 접수했습니다. 예약번호: {{reservation_number}}. 인원: {{attendee_count}}명. 전체 일정: {{schedule_label}}. 결제 예정 금액: {{final_amount}}. 결제가 완료되어야 예약이 확정됩니다. {{workshop_url}}'),
  ('workshop.payment_completed','workshop','워크샵 결제 및 예약 확정','{{customer_name}}님, {{workshop_name}} 결제와 예약이 확정되었습니다. 예약번호: {{reservation_number}}. 인원: {{attendee_count}}명. 전체 일정: {{schedule_label}}. 결제 금액: {{final_amount}}. {{workshop_url}}'),
  ('workshop.payment_completed_admin','workshop','워크샵 결제 완료 · 관리자','{{workshop_name}} / {{reservation_number}} / {{customer_name}} / {{attendee_count}}명 / {{final_amount}} 결제 완료. 일정: {{schedule_label}}. {{workshop_url}}'),
  ('workshop.cancelled','workshop','워크샵 예약 취소','{{customer_name}}님, {{workshop_name}} 예약 {{reservation_number}}이 취소되었습니다. {{workshop_url}}'),
  ('workshop.refund_completed','workshop','워크샵 환불 완료','{{customer_name}}님, {{workshop_name}} 예약 {{reservation_number}}의 {{final_amount}} 환불 처리가 완료되었습니다. 카드사 영업일에 따라 반영 시간이 다를 수 있습니다. {{workshop_url}}'),
  ('workshop.refund_completed_admin','workshop','워크샵 환불 완료 · 관리자','{{workshop_name}} / {{reservation_number}} / {{customer_name}} / {{final_amount}} 환불 완료. {{workshop_url}}'),
  ('workshop.payment_expired','workshop','워크샵 결제 기한 만료','{{customer_name}}님, {{workshop_name}} 신청 {{reservation_number}}의 결제 기한이 지나 예약이 해제되었습니다. {{workshop_url}}'),
  ('workshop.reminder','workshop','워크샵 일정 안내','{{customer_name}}님, {{workshop_name}} 예정 일정을 안내드립니다. {{schedule_label}}. 장소: {{workshop_location}}. 인원: {{attendee_count}}명. {{workshop_url}}'),
  ('workshop.minimum_not_met_admin','workshop','워크샵 최소 인원 확인 · 관리자','{{workshop_name}}의 확정 인원이 최소 인원에 미달했습니다. {{schedule_label}}. 확정 {{attendee_count}}명 / 최소 {{minimum_count}}명. 진행 여부와 고객 안내를 확인해주세요. {{workshop_url}}'),
  ('repair.payment_confirmed','repair','수선 결제 완료','{{customer_name}}님, 수선 {{repair_number}}의 {{final_amount}} 결제가 완료되었습니다. 발송을 준비합니다. {{repair_ticket_url}}'),
  ('repair.payment_confirmed_admin','repair','수선 결제 완료 · 관리자','수선 {{repair_number}} / {{customer_name}} / {{final_amount}} 결제 완료. 발송 준비를 확인해주세요. {{repair_admin_url}}'),
  ('repair.refund_completed','repair','수선 환불 완료','{{customer_name}}님, 수선 {{repair_number}}의 {{final_amount}} 환불 처리가 완료되었습니다. {{repair_ticket_url}}'),
  ('repair.refund_completed_admin','repair','수선 환불 완료 · 관리자','수선 {{repair_number}} / {{customer_name}} / {{final_amount}} 환불 완료. {{repair_admin_url}}')
), channels(channel) AS (VALUES ('email'), ('sms'))
INSERT INTO notification_templates (
  template_key, channel, area, name, trigger_label, active_subject, active_body, draft_subject, draft_body,
  default_subject, default_body, allowed_variables_json, required_variables_json, max_length, is_enabled, activated_at, created_at, updated_at
)
SELECT template_key, channel, area, name, name, '[Studio OALUM] ' || name, body, '[Studio OALUM] ' || name, body, '[Studio OALUM] ' || name, body,
  '["customer_name","customer_email","customer_phone","order_number","order_url","final_amount","tracking_number","tracking_url","workshop_name","reservation_number","attendee_count","schedule_label","workshop_url","workshop_location","minimum_count","repair_number","repair_ticket_url","repair_admin_url"]',
  '[]', CASE WHEN channel = 'sms' THEN 2000 ELSE 0 END, CASE WHEN channel = 'email' THEN 1 ELSE 0 END,
  '2026-09-24T00:00:00.000Z', '2026-09-24T00:00:00.000Z', '2026-09-24T00:00:00.000Z'
FROM seed CROSS JOIN channels WHERE true
ON CONFLICT(template_key, channel) DO UPDATE SET
  active_subject = CASE WHEN notification_templates.active_subject = notification_templates.default_subject THEN excluded.active_subject ELSE notification_templates.active_subject END,
  active_body = CASE WHEN notification_templates.active_body = notification_templates.default_body THEN excluded.active_body ELSE notification_templates.active_body END,
  default_subject = excluded.default_subject, default_body = excluded.default_body,
  allowed_variables_json = excluded.allowed_variables_json,
  is_enabled = CASE WHEN excluded.channel = 'email' THEN 1 ELSE 0 END,
  updated_at = excluded.updated_at;

UPDATE notification_templates SET is_enabled = 0 WHERE template_key IN ('workshop.reservation_completed','workshop.schedule_changed');