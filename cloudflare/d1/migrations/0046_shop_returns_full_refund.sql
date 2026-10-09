-- Only requests whose cancellation has not started adopt the new full-refund policy.
-- Preserve in-flight/reconciled/completed amounts for safe provider reconciliation.
UPDATE shop_returns
SET shipping_fee=0,refund_amount=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE status IN ('pending','awaiting_return') AND shipping_fee<>0;
