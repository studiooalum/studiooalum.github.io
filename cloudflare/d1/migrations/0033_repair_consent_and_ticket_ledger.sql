ALTER TABLE repair_requests
  ADD COLUMN archive_consent_status TEXT NOT NULL DEFAULT 'unrecorded'
  CHECK(archive_consent_status IN ('agreed', 'declined', 'unrecorded'));

UPDATE repair_requests
SET archive_consent_status = 'agreed'
WHERE archive_consent_at IS NOT NULL AND trim(archive_consent_at) <> '';

UPDATE repair_requests
SET bank_account = '국민 한아름 218301-04-144506'
WHERE trim(bank_account) = '';

UPDATE repair_requests
SET ticket_number = NULL
WHERE id = 'RPR_B6FF5E54CBE547B59F24B1421524A767'
  AND customer_name = '서규하';

UPDATE repair_requests
SET ticket_number = 4
WHERE id = 'RPR_5F82110FE64544B4BA050741757FECF4'
  AND customer_name = '정영복';

UPDATE repair_requests
SET ticket_number = 2
WHERE id = 'RPR_B6FF5E54CBE547B59F24B1421524A767'
  AND customer_name = '서규하';

UPDATE repair_ticket_number_sequence
SET next_number = MAX(next_number, 5)
WHERE id = 1;
