import { prepareNotification, createNotificationOutboxStatement } from "./notifications.js";
import { buildRepairTicketUrl } from "./repair-tickets.js";
import { ELIGIBLE_REPAIR_REMINDER_SQL, REPAIR_REMINDER_TEMPLATE, nextReminderSendTime } from "./repair-reminder-policy.js";

export async function enqueueRepairReminders(env, { now = new Date(), limit = 25 } = {}) {
  const db = env.OALUM_DB;
  if (!String(env.SMS_COUNTRY_ALLOWLIST || "KR").split(",").map(value => value.trim()).includes("KR")) return { queued: 0 };
  const result = await db.prepare(`${ELIGIBLE_REPAIR_REMINDER_SQL}
    AND NOT EXISTS (SELECT 1 FROM repair_ticket_reminders WHERE ticket_id = t.id)
    AND r.country_code = 'KR' AND trim(r.phone) <> ''
    ORDER BY m.created_at, t.id LIMIT ?`).bind(now.toISOString(), Math.min(50, Math.max(1, limit))).all();
  let queued = 0;
  for (const row of result.results || []) {
    const notification = await prepareNotification(env, {
      eventKey: `repair-ticket:${row.ticket_id}:unread-reminder`,
      entityType: "repair_ticket", entityId: row.ticket_id,
      channel: "sms", templateKey: REPAIR_REMINDER_TEMPLATE, recipient: row.phone,
      availableAt: nextReminderSendTime(now).toISOString(),
      payload: { customer_name: row.customer_name, repair_ticket_url: await buildRepairTicketUrl(env, { id: row.ticket_id, shortCode: row.short_code }) },
    });
    if (!notification) continue;
    const results = await db.batch([
      createNotificationOutboxStatement(db, notification, { ignoreDuplicate: true, reminderTicketId: row.ticket_id }),
      db.prepare(`INSERT OR IGNORE INTO repair_ticket_reminders (ticket_id, message_id, outbox_id, created_at)
        SELECT ?, ?, id, ? FROM notification_outbox WHERE event_key = ?`)
        .bind(row.ticket_id, row.message_id, now.toISOString(), notification.eventKey),
    ]);
    queued += Number(results[0]?.meta?.changes || 0);
  }
  return { queued };
}
