import { FAILURE_ALERT_TEMPLATE, reportNotificationFailure } from "./notification-failures.js";
import { createSolapiAuthorization } from "./sms-provider-solapi.js";

export async function recordNotificationDelivery(env, input) {
  if (!input.providerMessageId || input.providerMessageId.startsWith("dry-run:") || input.templateKey === FAILURE_ALERT_TEMPLATE) return;
  const channel = input.channel || "email";
  // Sending and delivery lookups intentionally use separate Resend keys. A
  // send-only key is enough for normal email delivery, but it cannot call the
  // retrieve-email endpoint. Do not create monitor jobs that can never run.
  if (channel === "email" && !String(env.RESEND_MONITOR_API_KEY || "").trim()) return;
  const now = new Date();
  await env.OALUM_DB.prepare(`INSERT OR IGNORE INTO notification_deliveries
    (channel,provider_id,source_key,template_key,recipient,status,created_at,next_check_at)
    VALUES (?,?,?,?,?,'pending',?,?)`).bind(channel, input.providerMessageId,
      input.sourceKey, input.templateKey || "direct.email", input.recipient || "", now.toISOString(), new Date(now.getTime() + 5 * 60000).toISOString()).run();
}

export async function trackDirectEmailResponse(env, response, templateKey, recipient) {
  const payload = await response.clone().json().catch(() => null);
  if (payload?.id) await recordNotificationDelivery(env, { providerMessageId: payload.id,
    sourceKey: `direct:${payload.id}`, templateKey, recipient: Array.isArray(recipient) ? recipient.join(", ") : recipient });
}

export async function reconcileNotificationDeliveries(env, { now = new Date(), fetchImpl = fetch, limit = 10 } = {}) {
  const db = env.OALUM_DB;
  const rows = await db.prepare(`SELECT * FROM notification_deliveries WHERE status='pending' AND next_check_at <= ? ORDER BY next_check_at LIMIT ?`)
    .bind(now.toISOString(), Math.min(20, limit)).all();
  const summary = { checked: 0, failed: 0, delivered: 0, unmonitored: 0 };
  for (const row of rows.results || []) {
    const next = new Date(now.getTime() + 15 * 60000).toISOString();
    const claimed = await db.prepare(`UPDATE notification_deliveries SET next_check_at=? WHERE channel=? AND provider_id=? AND status='pending' AND next_check_at=?`)
      .bind(next, row.channel, row.provider_id, row.next_check_at).run();
    if (!claimed.meta.changes) continue;
    let state = "pending", error = "";
    try {
      const sms = row.channel === "sms";
      const monitorApiKey = String(env.RESEND_MONITOR_API_KEY || "").trim();
      if (!sms && !monitorApiKey) {
        state = "unmonitored";
        error = "이메일 전달 상태 조회 키가 설정되지 않아 발송 접수 상태까지만 기록합니다.";
      }
      if (state === "unmonitored") {
        summary.unmonitored++;
      } else {
        const url = sms ? `https://api.solapi.com/messages/v4/groups/fast/${encodeURIComponent(row.provider_id)}` : `https://api.resend.com/emails/${encodeURIComponent(row.provider_id)}`;
        const authorization = sms ? await createSolapiAuthorization(env) : `Bearer ${monitorApiKey}`;
        const response = await fetchImpl(url, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(10000) });
        if (!response.ok) {
          if ([401,403].includes(response.status)) {
            state = "unmonitored";
            error = `전달 결과 조회 권한이 없습니다 (HTTP ${response.status}). 조회 전용 API 키 권한을 확인해주세요.`;
            summary.unmonitored++;
            await reportNotificationFailure(env, { sourceKey: `delivery-monitor:${row.channel}`, templateKey: "notification.delivery_monitor", channel: row.channel, status: "monitor_error", error });
          }
          throw new Error(`Delivery lookup HTTP ${response.status}`);
        }
        const payload = await response.json();
        summary.checked++;
        if (sms) {
          const count = (payload.groupInfo || payload).count || {};
          if (Number(count.sentFailed || 0) + Number(count.registeredFailed || 0) > 0) {
            state = "failed"; error = "SOLAPI가 접수 이후 문자 전달 실패를 보고했습니다.";
          } else if (Number(count.sentSuccess || 0) > 0 && Number(count.sentSuccess) >= Number(count.total || 1)) state = "delivered";
        } else {
          const event = payload.last_event;
          if (["bounced", "failed", "suppressed", "canceled", "complained"].includes(event)) {
            state = "failed"; error = `Resend 이메일 전달 결과: ${event}`;
          } else if (["delivered", "opened", "clicked"].includes(event)) state = "delivered";
        }
      }
    } catch (lookupError) {
      // Read failures never resend a customer message. Retry the read later.
      console.error("Notification delivery lookup pending", { channel: row.channel, status: String(lookupError.message).slice(0, 100) });
    }
    if (state === "pending" && now.getTime() - Date.parse(row.created_at) >= 7 * 86400000) {
      state = "unknown"; error = "7일 동안 최종 전달 결과를 확인하지 못했습니다. 제공업체 내역을 확인해주세요.";
    }
    if (["failed", "unknown"].includes(state)) {
      await reportNotificationFailure(env, { sourceKey: row.source_key, templateKey: row.template_key, recipient: row.recipient, channel: row.channel, status: state, error });
      const table = row.source_key.startsWith("notification_outbox:") ? "notification_outbox" : row.source_key.startsWith("repair_notification_outbox:") ? "repair_notification_outbox" : null;
      if (table) await db.prepare(`UPDATE ${table} SET status=?, last_error=?, updated_at=? WHERE id=? AND status='sent'`)
        .bind(state,error,now.toISOString(),row.source_key.slice(table.length + 1)).run();
      summary.failed++;
    }
    if (state === "delivered") summary.delivered++;
    if (state !== "pending") await db.prepare(`UPDATE notification_deliveries SET status=? WHERE channel=? AND provider_id=?`)
      .bind(state,row.channel,row.provider_id).run();
  }
  return summary;
}
