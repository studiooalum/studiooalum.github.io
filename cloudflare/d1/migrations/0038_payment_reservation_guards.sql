CREATE TRIGGER IF NOT EXISTS trg_workshop_payment_lock
BEFORE UPDATE OF status, amount_due ON workshop_reservations
WHEN EXISTS (SELECT 1 FROM workshop_payment_orders WHERE reservation_id = OLD.id AND status = 'processing')
  AND (NEW.status IS NOT OLD.status OR NEW.amount_due IS NOT OLD.amount_due)
BEGIN
  SELECT RAISE(ABORT, 'workshop_payment_in_progress');
END;

CREATE INDEX IF NOT EXISTS idx_workshop_reservation_expiry ON workshop_reservations(status, created_at);
CREATE INDEX IF NOT EXISTS idx_workshop_reservation_schedule ON workshop_reservations(status, slot_date);