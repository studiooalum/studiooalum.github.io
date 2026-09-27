UPDATE workshops
SET booking_config_json = json_set(
  CASE
    WHEN json_valid(booking_config_json) THEN booking_config_json
    ELSE '{}'
  END,
  '$.workshopType',
  CASE
    WHEN json_valid(booking_config_json)
      AND json_extract(booking_config_json, '$.workshopType') = 'daily' THEN 'daily'
    WHEN json_valid(booking_config_json)
      AND json_extract(booking_config_json, '$.mode') = 'daily' THEN 'daily'
    ELSE 'event'
  END
);

ALTER TABLE workshops DROP COLUMN category;
