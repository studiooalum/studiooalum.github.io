export const REPAIR_REMINDER_TEMPLATE = "ticket.unread_reminder";
export const REPAIR_REMINDER_DELAY_MS = 24 * 60 * 60 * 1000;

export function nextReminderSendTime(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hour = kst.getUTCHours();
  if (hour >= 9 && hour < 21) return now;
  kst.setUTCHours(9, 0, 0, 0);
  if (hour >= 21) kst.setUTCDate(kst.getUTCDate() + 1);
  return new Date(kst.getTime() - 9 * 60 * 60 * 1000);
}

// System status updates do not replace the latest human conversation message.
export const ELIGIBLE_REPAIR_REMINDER_SQL = `
  SELECT t.id AS ticket_id, t.short_code, r.id AS repair_id, r.customer_name,
    r.email, r.phone, r.country_code, m.id AS message_id, m.created_at AS message_created_at
  FROM repair_tickets t
  JOIN repair_requests r ON r.id = t.repair_id
  JOIN repair_ticket_messages m ON m.id = (
    SELECT id FROM repair_ticket_messages WHERE ticket_id = t.id
      AND author_type IN ('admin', 'customer')
    ORDER BY created_at DESC, rowid DESC LIMIT 1
  )
  WHERE t.status = 'open' AND r.status NOT IN ('closed', 'cancelled', 'rejected', 'archived', 'declined')
    AND m.author_type = 'admin' AND m.read_at IS NULL
    AND julianday(m.created_at) <= julianday(?) - 1
`;

export async function guardRepairReminder(env, notification, now) {
  const db = env.OALUM_DB;
  const ledger = await db.prepare(`SELECT * FROM repair_ticket_reminders WHERE ticket_id = ? AND outbox_id = ?`)
    .bind(notification.entity_id, notification.id).first();
  if (!ledger || ledger.attempted_at) {
    await db.prepare(`UPDATE notification_outbox SET status='unknown', last_error='리마인더 발송 기록을 확인해야 합니다. 중복 발송 방지를 위해 중단했습니다.', locked_at=NULL, locked_by=NULL WHERE id=? AND status='processing'`).bind(notification.id).run();
    return "cancel";
  }
  const template = await db.prepare(`SELECT is_enabled FROM notification_templates WHERE template_key = ? AND channel = 'sms'`)
    .bind(REPAIR_REMINDER_TEMPLATE).first();
  const eligible = await db.prepare(`${ELIGIBLE_REPAIR_REMINDER_SQL} AND t.id = ? AND m.id = ?`)
    .bind(now.toISOString(), notification.entity_id, ledger.message_id).first();
  if (!eligible || !template?.is_enabled || eligible.country_code !== "KR" || !eligible.phone?.trim() || eligible.phone !== notification.recipient) {
    // No provider request was made; a later unread conversation can still qualify.
    await db.batch([
      db.prepare(`DELETE FROM notification_outbox WHERE id = ? AND status = 'processing'`).bind(notification.id),
      db.prepare(`DELETE FROM repair_ticket_reminders WHERE ticket_id = ? AND attempted_at IS NULL`).bind(notification.entity_id),
    ]);
    return "cancel";
  }
  const availableAt = nextReminderSendTime(now).toISOString();
  if (availableAt !== now.toISOString() || String(env.SMS_ENABLED).toLowerCase() !== "true" || String(env.SMS_DRY_RUN).toLowerCase() !== "false") {
    await db.prepare(`UPDATE notification_outbox SET status = 'pending', available_at = ?, locked_at = NULL, locked_by = NULL WHERE id = ?`)
      .bind(availableAt === now.toISOString() ? new Date(now.getTime() + 5 * 60000).toISOString() : availableAt, notification.id).run();
    return "defer";
  }
  const result = await db.prepare(`UPDATE repair_ticket_reminders SET attempted_at = ? WHERE ticket_id = ? AND outbox_id = ? AND attempted_at IS NULL`)
    .bind(now.toISOString(), notification.entity_id, notification.id).run();
  return Number(result?.meta?.changes || 0) === 1 ? "send" : "cancel";
}
