-- Issue the permanent public ticket number as soon as a repair item is received.
-- Existing inquiries remain pending, while any received or later repair missing a
-- number is backfilled in a deterministic order. Existing numbers are untouched.
INSERT OR IGNORE INTO repair_ticket_number_sequence (id, next_number) VALUES (1, 1);

WITH pending AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY COALESCE(updated_at, created_at), created_at, id) AS row_number
  FROM repair_requests
  WHERE ticket_number IS NULL
    AND status IN ('item_received', 'in_progress', 'payment_pending', 'shipping', 'closed')
),
sequence_start AS (
  SELECT MAX(
    next_number,
    COALESCE((SELECT MAX(ticket_number) + 1 FROM repair_requests WHERE ticket_number IS NOT NULL), 1)
  ) AS first_number
  FROM repair_ticket_number_sequence
  WHERE id = 1
)
UPDATE repair_requests
SET ticket_number = (
  SELECT sequence_start.first_number + pending.row_number - 1
  FROM pending, sequence_start
  WHERE pending.id = repair_requests.id
)
WHERE id IN (SELECT id FROM pending);

UPDATE repair_ticket_number_sequence
SET next_number = COALESCE(
  (SELECT MAX(ticket_number) + 1 FROM repair_requests WHERE ticket_number IS NOT NULL),
  1
)
WHERE id = 1;
