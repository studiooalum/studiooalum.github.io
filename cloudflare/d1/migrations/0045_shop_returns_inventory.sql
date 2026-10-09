CREATE TABLE IF NOT EXISTS shop_returns (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  reason_code TEXT NOT NULL,
  reason_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','awaiting_return','refunding','reconcile','completed','rejected')),
  shipping_fee INTEGER NOT NULL DEFAULT 0 CHECK(shipping_fee IN (0,4000)),
  refund_amount INTEGER,
  decision_note TEXT NOT NULL DEFAULT '',
  received_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  notified_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS shop_returns_active ON shop_returns(order_id) WHERE status <> 'rejected';
-- Preserve existing pending requests; approvals now require the administrator session.
INSERT OR IGNORE INTO shop_returns(id,order_id,reason_code,reason_note,created_at,updated_at)
SELECT 'LEGACY_' || r.id,r.order_id,'other',r.request_note,r.created_at,r.updated_at
FROM order_cancellation_requests r JOIN orders o ON o.id=r.order_id
WHERE r.status = 'pending' AND o.status NOT IN ('cancelled','refunded','payment_failed');

CREATE TABLE IF NOT EXISTS edition_claims (
  product_id TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(product_id,order_id)
);
-- Multiple historical purchases remain represented until each is refunded.
INSERT OR IGNORE INTO edition_claims(product_id,order_id,created_at)
SELECT COALESCE(NULLIF(i.product_id,''),i.line_id),o.id,o.updated_at
FROM order_items i JOIN orders o ON o.id=i.order_id
WHERE o.status IN ('paid','completed','fulfilled','partially_refunded')
 OR (o.status='payment_pending' AND o.active_payment_key IS NOT NULL);

CREATE TRIGGER IF NOT EXISTS edition_claim_before_payment
BEFORE UPDATE OF status,active_payment_key ON orders
WHEN NEW.status IN ('payment_pending','paid') AND OLD.status NOT IN ('paid','completed','fulfilled','partially_refunded','refunded','cancelled')
BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM order_items WHERE order_id=NEW.id AND quantity<>1)
    THEN RAISE(ABORT,'EDITION_QUANTITY_ONE') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM order_items WHERE order_id=NEW.id GROUP BY COALESCE(NULLIF(product_id,''),line_id) HAVING count(*)>1)
    THEN RAISE(ABORT,'EDITION_QUANTITY_ONE') END;
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM order_items i JOIN edition_claims c ON c.product_id=COALESCE(NULLIF(i.product_id,''),i.line_id)
    WHERE i.order_id=NEW.id AND c.order_id<>NEW.id
  ) THEN RAISE(ABORT,'EDITION_UNAVAILABLE') END;
  INSERT OR IGNORE INTO edition_claims(product_id,order_id,created_at)
    SELECT COALESCE(NULLIF(product_id,''),line_id),NEW.id,NEW.updated_at FROM order_items WHERE order_id=NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS edition_release_after_payment
AFTER UPDATE OF status ON orders
WHEN NEW.status IN ('payment_failed','cancelled','refunded')
BEGIN
  DELETE FROM edition_claims WHERE order_id=NEW.id;
END;
-- A pending return cannot be shipped accidentally while being reviewed.
CREATE TRIGGER IF NOT EXISTS return_blocks_shipping
BEFORE UPDATE OF status ON shipments
WHEN NEW.status IN ('shipped','delivered') AND OLD.status NOT IN ('shipped','delivered','returned')
 AND EXISTS(SELECT 1 FROM shop_returns WHERE order_id=NEW.order_id AND status IN ('pending','awaiting_return','refunding','reconcile','completed'))
BEGIN SELECT RAISE(ABORT,'RETURN_PENDING'); END;

INSERT OR IGNORE INTO notification_templates(
template_key,channel,area,name,trigger_label,active_subject,active_body,draft_subject,draft_body,default_subject,default_body,
allowed_variables_json,required_variables_json,max_length,is_enabled,activated_at,created_at,updated_at)
SELECT template_key,'email','shop',name,'반품·환불 상태 변경',subject,replace(body,'\n',char(10)),subject,replace(body,'\n',char(10)),subject,replace(body,'\n',char(10)),
'["order_number","product_name","refund_status","refund_reason","refund_amount","return_fee","order_url"]',
'["order_number","refund_status","order_url"]',0,1,datetime('now'),datetime('now'),datetime('now')
FROM (
 SELECT 'shop.return_update' AS template_key,'반품·환불 안내' AS name,'[Studio OALUM] 반품·환불 {{refund_status}}' AS subject,
 'Studio OALUM 주문 {{order_number}}\n상품: {{product_name}}\n상태: {{refund_status}}\n사유 및 안내: {{refund_reason}}\n환불 금액(예정 또는 완료): {{refund_amount}}\n배송비 공제: {{return_fee}}\n주문 확인: {{order_url}}' AS body
 UNION ALL SELECT 'shop.return_update_admin','반품·환불 · 관리자','[Studio OALUM] 반품·환불 {{refund_status}}',
 '주문 {{order_number}}\n상품: {{product_name}}\n상태: {{refund_status}}\n사유 및 안내: {{refund_reason}}\n환불 금액(예정 또는 완료): {{refund_amount}}\n배송비 공제: {{return_fee}}\n관리자 로그인 후 요청 검토: {{order_url}}'
);
