-- Partial refunds need an operator to reconcile items, seats and benefits.
-- Do not label these payments as fully refunded or send full-refund receipts.
INSERT OR IGNORE INTO notification_templates (
  template_key, channel, area, name, trigger_label, active_subject, active_body,
  draft_subject, draft_body, default_subject, default_body,
  allowed_variables_json, required_variables_json, max_length, is_enabled,
  activated_at, created_at, updated_at
) VALUES (
  'shop.payment_review_required_admin', 'email', 'shop', '결제 부분 취소 확인 · 관리자', '토스 부분 취소 감지',
  '[Studio OALUM] 결제 부분 취소 확인 필요',
  '토스에서 주문 {{order_number}}의 부분 취소가 확인되었습니다. 남은 결제 금액: {{final_amount}}. 주문 상품, 워크샵 인원, 쿠폰과 적립금 조정이 필요한지 확인해주세요. 자동 전액 환불이나 예약 취소는 실행하지 않았습니다. 관리 화면: {{order_url}}',
  '[Studio OALUM] 결제 부분 취소 확인 필요',
  '토스에서 주문 {{order_number}}의 부분 취소가 확인되었습니다. 남은 결제 금액: {{final_amount}}. 주문 상품, 워크샵 인원, 쿠폰과 적립금 조정이 필요한지 확인해주세요. 자동 전액 환불이나 예약 취소는 실행하지 않았습니다. 관리 화면: {{order_url}}',
  '[Studio OALUM] 결제 부분 취소 확인 필요',
  '토스에서 주문 {{order_number}}의 부분 취소가 확인되었습니다. 남은 결제 금액: {{final_amount}}. 주문 상품, 워크샵 인원, 쿠폰과 적립금 조정이 필요한지 확인해주세요. 자동 전액 환불이나 예약 취소는 실행하지 않았습니다. 관리 화면: {{order_url}}',
  '["order_number","final_amount","order_url"]', '["order_number","final_amount","order_url"]', 0, 1,
  '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'
);
