-- Durable records survive notification history cleanup, preserving once-only delivery.
CREATE TABLE IF NOT EXISTS repair_ticket_reminders (
  ticket_id TEXT PRIMARY KEY REFERENCES repair_tickets(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  outbox_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  attempted_at TEXT
);
CREATE TABLE IF NOT EXISTS notification_failure_events (
  event_key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

INSERT INTO notification_templates (template_key,channel,area,name,description,trigger_label,active_subject,active_body,draft_subject,draft_body,default_subject,default_body,allowed_variables_json,required_variables_json,max_length,is_enabled,activated_at,created_at,updated_at)
VALUES ('ticket.unread_reminder','sms','ticket','수선 미확인 메시지 리마인더','마지막 관리자 메시지 24시간 미확인 · 티켓당 1회 · KST 09:00~21:00 이전','관리자 답변 24시간 미확인','','[오알룸] 확인이 필요한 수선 메시지가 있습니다.
{{repair_ticket_url}}','','[오알룸] 확인이 필요한 수선 메시지가 있습니다.
{{repair_ticket_url}}','','[오알룸] 확인이 필요한 수선 메시지가 있습니다.
{{repair_ticket_url}}','["customer_name","repair_ticket_url"]','["repair_ticket_url"]',2000,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(template_key,channel) DO UPDATE SET name=excluded.name,description=excluded.description,trigger_label=excluded.trigger_label,active_subject=excluded.active_subject,active_body=excluded.active_body,draft_subject=excluded.draft_subject,draft_body=excluded.draft_body,default_subject=excluded.default_subject,default_body=excluded.default_body,allowed_variables_json=excluded.allowed_variables_json,required_variables_json=excluded.required_variables_json,is_enabled=1,activated_at=excluded.activated_at,updated_at=excluded.updated_at;
INSERT OR IGNORE INTO notification_template_revisions(id,template_key,channel,action,subject,body,is_enabled,actor_id,created_at) SELECT 'migration-0043-ticket.unread_reminder',template_key,channel,'activated',active_subject,active_body,1,'migration-0043',updated_at FROM notification_templates WHERE template_key='ticket.unread_reminder' AND channel='sms';

INSERT INTO notification_templates (template_key,channel,area,name,description,trigger_label,active_subject,active_body,draft_subject,draft_body,default_subject,default_body,allowed_variables_json,required_variables_json,max_length,is_enabled,activated_at,created_at,updated_at)
VALUES ('notification.delivery_failed_admin','email','ticket','전체 메시지 발송 실패 알림','문자·이메일 발송 오류를 관리자에게 1회 안내합니다.','발송 오류 감지','[Studio OALUM] 메시지 발송 실패 · {{notification_channel}}','메시지 발송 중 문제가 발생했습니다.
종류: {{notification_type}}
대상: {{notification_recipient}}
기록: {{notification_id}}
상태: {{notification_status}}
원인: {{notification_error}}

알림 관리에서 확인해주세요.
{{notification_admin_url}}','[Studio OALUM] 메시지 발송 실패 · {{notification_channel}}','메시지 발송 중 문제가 발생했습니다.
종류: {{notification_type}}
대상: {{notification_recipient}}
기록: {{notification_id}}
상태: {{notification_status}}
원인: {{notification_error}}

알림 관리에서 확인해주세요.
{{notification_admin_url}}','[Studio OALUM] 메시지 발송 실패 · {{notification_channel}}','메시지 발송 중 문제가 발생했습니다.
종류: {{notification_type}}
대상: {{notification_recipient}}
기록: {{notification_id}}
상태: {{notification_status}}
원인: {{notification_error}}

알림 관리에서 확인해주세요.
{{notification_admin_url}}','["notification_channel","notification_type","notification_recipient","notification_id","notification_status","notification_error","notification_admin_url"]','["notification_id","notification_error","notification_admin_url"]',0,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(template_key,channel) DO UPDATE SET name=excluded.name,description=excluded.description,trigger_label=excluded.trigger_label,active_subject=excluded.active_subject,active_body=excluded.active_body,draft_subject=excluded.draft_subject,draft_body=excluded.draft_body,default_subject=excluded.default_subject,default_body=excluded.default_body,allowed_variables_json=excluded.allowed_variables_json,required_variables_json=excluded.required_variables_json,is_enabled=1,activated_at=excluded.activated_at,updated_at=excluded.updated_at;
INSERT OR IGNORE INTO notification_template_revisions(id,template_key,channel,action,subject,body,is_enabled,actor_id,created_at) SELECT 'migration-0043-notification.delivery_failed_admin',template_key,channel,'activated',active_subject,active_body,1,'migration-0043',updated_at FROM notification_templates WHERE template_key='notification.delivery_failed_admin' AND channel='email';

CREATE TABLE IF NOT EXISTS notification_monitor_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO notification_monitor_settings(key,value) VALUES ('failures_since',strftime('%Y-%m-%dT%H:%M:%fZ','now'));

CREATE TABLE IF NOT EXISTS notification_deliveries (
  channel TEXT NOT NULL, provider_id TEXT NOT NULL, source_key TEXT NOT NULL,
  template_key TEXT NOT NULL, recipient TEXT NOT NULL, status TEXT NOT NULL,
  created_at TEXT NOT NULL, next_check_at TEXT NOT NULL,
  PRIMARY KEY(channel,provider_id)
);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_pending ON notification_deliveries(status,next_check_at);
