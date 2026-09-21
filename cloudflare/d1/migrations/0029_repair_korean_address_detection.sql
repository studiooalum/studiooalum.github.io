-- Correct Korean Repair shipping addresses that were previously classified as
-- OTHER because they used a province abbreviation or omitted the province.
UPDATE repair_requests
SET country_code = 'KR'
WHERE country_code = 'OTHER'
  AND REPLACE(REPLACE(REPLACE(TRIM(COALESCE(phone, '')), '-', ''), ' ', ''), '+82', '0') GLOB '010[0-9]*'
  AND LENGTH(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(phone, '')), '-', ''), ' ', ''), '+82', '0')) = 11
  AND (
    shipping_address LIKE '%경기 %'
    OR shipping_address LIKE '%강원 %'
    OR shipping_address LIKE '%충북 %'
    OR shipping_address LIKE '%충남 %'
    OR shipping_address LIKE '%전북 %'
    OR shipping_address LIKE '%전남 %'
    OR shipping_address LIKE '%경북 %'
    OR shipping_address LIKE '%경남 %'
    OR shipping_address LIKE '%제주 %'
    OR (
      (shipping_address LIKE '%시 %' OR shipping_address LIKE '%군 %' OR shipping_address LIKE '%구 %')
      AND (shipping_address GLOB '*로[0-9]*' OR shipping_address GLOB '*길[0-9]*')
    )
  );
