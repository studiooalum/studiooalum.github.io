export const FAILURE_ALERT_TEMPLATE = "notification.delivery_failed_admin";

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Never include message bodies, access links, credentials or verification codes.
export async function reportNotificationFailure(env, input) {
  if (input.templateKey === FAILURE_ALERT_TEMPLATE) return;
  const db = env.OALUM_DB;
  const eventKey = `failure:${input.sourceKey}`;
  const now = new Date().toISOString();
  const template = await db.prepare(`SELECT * FROM notification_templates WHERE template_key = ? AND channel = 'email'`)
    .bind(FAILURE_ALERT_TEMPLATE).first();
  if (!template?.is_enabled) return;
  const recipient = String(env.NOTIFICATION_FAILURE_EMAIL || env.REPAIR_ADMIN_EMAIL || "studio.oalum@gmail.com").trim();
  const masked = String(input.recipient || "").replace(/^(.{2}).*(@.*)$/, "$1***$2").replace(/\d(?=\d{4})/g, "*");
  const variables = {
    notification_channel: input.channel || "email", notification_type: input.templateKey || "직접 발송",
    notification_recipient: masked, notification_id: input.sourceKey,
    notification_status: input.status || "failed", notification_error: String(input.error || "발송 실패").slice(0, 500),
    notification_admin_url: `${String(env.PUBLIC_SITE_URL || env.SITE_URL || "https://studiooalum.com").replace(/\/$/, "")}/notification-admin`,
  };
  const render = text => String(text).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key) => variables[key] || "");
  const body = render(template.active_body);
  // Both statements run in a transaction; purging the outbox cannot re-alert a failure.
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO notification_outbox
      (id,event_key,entity_type,entity_id,channel,recipient,template_key,payload_json,subject,body_text,body_html,status,attempts,available_at,created_at,updated_at)
      SELECT ?,?,'notification_failure',?,'email',?,?,?, ?,?,?,'pending',0,?,?,?
      WHERE NOT EXISTS (SELECT 1 FROM notification_failure_events WHERE event_key = ?)`)
      .bind(`NFA_${crypto.randomUUID()}`,eventKey,input.sourceKey,recipient,FAILURE_ALERT_TEMPLATE,JSON.stringify(variables),render(template.active_subject),body,`<p>${escapeHtml(body).replace(/\n/g,"<br>")}</p>`,now,now,now,eventKey),
    db.prepare(`INSERT OR IGNORE INTO notification_failure_events(event_key,created_at) VALUES (?,?)`).bind(eventKey,now),
  ]);
}

export async function monitorDirectEmail(env, { sourceKey = `direct:${crypto.randomUUID()}`, templateKey, recipient }, send) {
  try {
    const result = await send();
    if (result === false) await reportNotificationFailure(env, { sourceKey, templateKey, recipient, channel: "email", status: "failed", error: "이메일 발송 설정이 없어 메시지를 발송하지 못했습니다." });
    return result;
  }
  catch (error) {
    await reportNotificationFailure(env, { sourceKey, templateKey, recipient, channel: "email", status: "failed", error: error.message });
    throw error;
  }
}

// Recovers failures if a process stopped between recording the outcome and queuing its alert.
export async function reconcileNotificationFailures(env) {
  const db = env.OALUM_DB;
  const settings = await db.prepare("SELECT value FROM notification_monitor_settings WHERE key = 'failures_since'").first();
  for (const [table, key, attempts] of [["notification_outbox", "template_key", "attempts"], ["repair_notification_outbox", "event_type", "attempt_count"]]) {
    const rows = await db.prepare(`SELECT * FROM ${table} o WHERE last_error IS NOT NULL
      AND (status IN ('failed','unknown','dead_letter') OR (status='pending' AND ${attempts}>0))
      AND ${key} <> ? AND julianday(updated_at) >= julianday(?)
      AND NOT EXISTS (SELECT 1 FROM notification_failure_events WHERE event_key = 'failure:' || ? || ':' || o.id)
      ORDER BY updated_at LIMIT 30`).bind(FAILURE_ALERT_TEMPLATE, env.NOTIFICATION_FAILURES_SINCE || settings.value, table).all();
    for (const row of rows.results || []) {
      await reportNotificationFailure(env, { sourceKey: `${table}:${row.id}`, templateKey: row[key], channel: row.channel,
        recipient: row.recipient, status: row.status, error: row.last_error });
    }
  }
}
