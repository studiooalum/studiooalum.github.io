UPDATE notification_templates
SET is_enabled = 0,
    activated_at = NULL,
    description = CASE
      WHEN instr(description, '기존 발송 경로') > 0 THEN description
      ELSE description || ' 기존 발송 경로를 유지하는 전환 준비 템플릿입니다.'
    END,
    updated_at = '2026-08-24T00:00:00.000Z'
WHERE area IN ('shop', 'workshop');
