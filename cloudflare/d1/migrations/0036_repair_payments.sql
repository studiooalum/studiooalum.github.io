CREATE TABLE IF NOT EXISTS repair_payment_orders (
  id TEXT PRIMARY KEY,
  repair_id TEXT NOT NULL REFERENCES repair_requests(id),
  amount INTEGER NOT NULL CHECK(amount > 0),
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK(currency = 'KRW'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','paid','cancelled','refunded')),
  payment_key TEXT UNIQUE,
  expires_at TEXT NOT NULL,
  approved_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_payment_active ON repair_payment_orders(repair_id) WHERE status IN ('pending','processing','paid');
CREATE INDEX IF NOT EXISTS idx_repair_payment_status ON repair_payment_orders(status, updated_at);

CREATE TRIGGER IF NOT EXISTS trg_repair_payment_quote_lock
BEFORE UPDATE OF final_amount, status, payment_confirmed_at ON repair_requests
WHEN EXISTS (SELECT 1 FROM repair_payment_orders WHERE repair_id = OLD.id AND (
  (status IN ('processing', 'paid') AND NEW.final_amount IS NOT OLD.final_amount)
  OR (status = 'processing' AND (NEW.status IS NOT OLD.status OR NEW.payment_confirmed_at IS NOT OLD.payment_confirmed_at))
))
BEGIN
  SELECT RAISE(ABORT, 'repair_payment_in_progress');
END;