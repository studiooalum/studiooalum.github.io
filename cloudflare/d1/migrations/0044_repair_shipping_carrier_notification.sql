-- Include the Repair Admin carrier value in both active shipping notices.
UPDATE notification_templates
SET active_body = replace(active_body, '운송장 번호:', '택배회사: {{carrier}}' || char(10) || '운송장 번호:'),
    draft_body = replace(draft_body, '운송장 번호:', '택배회사: {{carrier}}' || char(10) || '운송장 번호:'),
    default_body = replace(default_body, '운송장 번호:', '택배회사: {{carrier}}' || char(10) || '운송장 번호:'),
    allowed_variables_json = CASE channel
      WHEN 'email' THEN '["customer_name","product_name","repair_number","carrier","tracking_number","tracking_url","repair_ticket_url"]'
      ELSE '["customer_name","carrier","tracking_number","tracking_url","repair_ticket_url"]'
    END,
    required_variables_json = '["customer_name","carrier","tracking_number","repair_ticket_url"]',
    updated_at = '2026-10-08T00:00:00.000Z'
WHERE template_key = 'repair.payment_confirmed_shipping_started'
  AND instr(active_body, '{{carrier}}') = 0;
