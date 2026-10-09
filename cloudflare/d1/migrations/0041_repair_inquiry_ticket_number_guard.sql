-- New repair inquiries intentionally receive a public ticket number only when
-- work starts. Remove both historical guard names so a NULL ticket_number is
-- accepted during the initial application.
DROP TRIGGER IF EXISTS trg_repair_requests_ticket_number;
DROP TRIGGER IF EXISTS trg_repair_requests_ticket_number_required;
