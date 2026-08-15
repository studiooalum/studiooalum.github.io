ALTER TABLE repair_requests ADD COLUMN preferred_contact TEXT NOT NULL DEFAULT 'email';
ALTER TABLE repair_requests ADD COLUMN desired_result TEXT NOT NULL DEFAULT '';
ALTER TABLE repair_requests ADD COLUMN budget_note TEXT NOT NULL DEFAULT '';
ALTER TABLE repair_requests ADD COLUMN privacy_consent_at TEXT;
ALTER TABLE repair_requests ADD COLUMN archive_consent_at TEXT;

UPDATE repair_requests
SET preferred_contact = CASE
  WHEN contact_preference IN ('email', 'phone') THEN contact_preference
  ELSE 'email'
END;

UPDATE repair_requests
SET privacy_consent_at = terms_accepted_at
WHERE privacy_consent_at IS NULL OR privacy_consent_at = '';

UPDATE repair_requests
SET status = CASE status
  WHEN 'submitted' THEN 'received'
  WHEN 'accepted' THEN 'approved'
  WHEN 'ready' THEN 'completed'
  WHEN 'declined' THEN 'rejected'
  WHEN 'archived' THEN 'completed'
  ELSE status
END;

CREATE INDEX IF NOT EXISTS idx_repair_requests_archive_candidate
  ON repair_requests(archive_consent_at, status, completed_at DESC);