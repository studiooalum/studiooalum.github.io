import { sendResendNotification } from "./email-provider-resend.js";
import { getSolapiMessageType, sendSolapiNotification } from "./sms-provider-solapi.js";

const MAX_ATTEMPTS = 5;
const LOCK_TIMEOUT_MS = 10 * 60 * 1000;
const VARIABLE_PATTERN = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const NOTIFICATION_VARIABLES = Object.freeze({
  customer_name: { label: "고객명", sample: "홍길동" },
  product_name: { label: "제품명", sample: "자켓" },
  repair_number: { label: "수선 번호", sample: "REP-20260823-ABCD1234" },
  final_amount: { label: "최종 가격", sample: "35,000원" },
  tracking_number: { label: "운송장 번호", sample: "1234567890" },
  tracking_url: { label: "배송 조회 링크", sample: "https://example.com/tracking" },
  repair_url: { label: "수선 조회 링크", sample: "https://studiooalum.com/account.html" },
  repair_ticket_url: { label: "수선 티켓 링크", sample: "https://studiooalum.com/repair-ticket.html?ticket=RPT_SAMPLE" },
  studio_address: { label: "OALUM Studio 주소", sample: "서울특별시 동대문구 이문로 145 2층 201호" },
  repair_status: { label: "현재 수선 상태", sample: "수선 진행 중" },
  order_number: { label: "주문 번호", sample: "ORD-OALUM-CF-SAMPLE" },
  order_url: { label: "주문 조회 링크", sample: "https://studiooalum.com/account.html" },
  workshop_name: { label: "워크숍명", sample: "Visible Mending" },
  reservation_number: { label: "워크숍 예약번호", sample: "WKS-WRS_SAMPLE" },
  workshop_url: { label: "워크숍 링크", sample: "https://studiooalum.com/workshops.html" },
  schedule_label: { label: "일정", sample: "2026. 09. 01. 14:00" },
});

function cleanText(value, maxLength = 4000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function requireDb(env) {
  const database = env?.OALUM_DB;
  if (!database) throw Object.assign(new Error("D1 바인딩이 준비되지 않았습니다."), { status: 503 });
  return database;
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").toUpperCase()}`;
}

function nowIso(date = new Date()) {
  return date.toISOString();
}

function decodeJson(value, fallback = []) {
  try {
    return JSON.parse(value || "") ?? fallback;
  } catch {
    return fallback;
  }
}

function readChanges(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getBackoffMilliseconds(attempts) {
  return Math.min(60 * 60 * 1000, 30 * 1000 * (2 ** Math.max(0, attempts - 1)));
}

function unique(values) {
  return [...new Set(values)];
}

function extractVariables(value) {
  return unique(Array.from(String(value || "").matchAll(VARIABLE_PATTERN), (match) => match[1]));
}

function formatTemplateRow(row) {
  return {
    templateKey: row.template_key,
    channel: row.channel,
    area: row.area,
    name: row.name,
    description: row.description || "",
    triggerLabel: row.trigger_label || "",
    activeSubject: row.active_subject || "",
    activeBody: row.active_body || "",
    draftSubject: row.draft_subject || "",
    draftBody: row.draft_body || "",
    defaultSubject: row.default_subject || "",
    defaultBody: row.default_body || "",
    allowedVariables: decodeJson(row.allowed_variables_json, []),
    requiredVariables: decodeJson(row.required_variables_json, []),
    maxLength: Number(row.max_length || 0),
    isEnabled: Boolean(row.is_enabled),
    activatedAt: row.activated_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function formatOutboxRow(row) {
  return {
    id: row.id,
    eventKey: row.event_key,
    entityType: row.entity_type,
    entityId: row.entity_id,
    channel: row.channel,
    recipient: row.recipient,
    templateKey: row.template_key,
    status: row.status,
    attempts: Number(row.attempts || 0),
    providerMessageId: row.provider_message_id || "",
    lastError: row.last_error || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    sentAt: row.sent_at || "",
  };
}

export function validateNotificationTemplate(template, values = {}) {
  const channel = cleanText(values.channel || template.channel, 20);
  const subject = cleanText(values.subject ?? values.draftSubject ?? template.draftSubject ?? template.draft_subject, 500);
  const body = cleanText(values.body ?? values.draftBody ?? template.draftBody ?? template.draft_body, 6000);
  const allowedVariables = template.allowedVariables || decodeJson(template.allowed_variables_json, []);
  const requiredVariables = template.requiredVariables || decodeJson(template.required_variables_json, []);
  const usedVariables = unique([...extractVariables(subject), ...extractVariables(body)]);
  const unsupportedVariables = usedVariables.filter((variable) => !allowedVariables.includes(variable));
  const missingVariables = requiredVariables.filter((variable) => !usedVariables.includes(variable));
  const errors = [];
  if (channel === "email" && !subject) errors.push("이메일 제목을 입력해주세요.");
  if (!body) errors.push("알림 본문을 입력해주세요.");
  if (unsupportedVariables.length) errors.push(`지원하지 않는 변수: ${unsupportedVariables.join(", ")}`);
  if (missingVariables.length) errors.push(`필수 변수 누락: ${missingVariables.join(", ")}`);
  if (channel === "sms" && body) {
    try {
      const message = getSolapiMessageType(renderNotificationText(body, Object.fromEntries(allowedVariables.map((variable) => [variable, NOTIFICATION_VARIABLES[variable]?.sample || variable]))));
      const maxLength = Number(template.maxLength || template.max_length || 2000);
      if (message.byteLength > maxLength) errors.push(`문자 본문은 ${maxLength}byte 이하로 입력해주세요.`);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return { valid: errors.length === 0, errors, usedVariables, unsupportedVariables, missingVariables, subject, body };
}

export function renderNotificationText(templateText, payload) {
  return String(templateText || "").replace(VARIABLE_PATTERN, (_, variable) => String(payload?.[variable] ?? ""));
}

function renderNotification(template, payload, source = "active") {
  const subjectTemplate = source === "draft" ? template.draft_subject : template.active_subject;
  const bodyTemplate = source === "draft" ? template.draft_body : template.active_body;
  const validation = validateNotificationTemplate(template, { channel: template.channel, subject: subjectTemplate, body: bodyTemplate });
  const selectedSubject = validation.valid ? subjectTemplate : template.default_subject;
  const selectedBody = validation.valid ? bodyTemplate : template.default_body;
  const subject = renderNotificationText(selectedSubject, payload);
  const bodyText = renderNotificationText(selectedBody, payload);
  const bodyHtml = `<div style="font-family:Arial,sans-serif;color:#111;line-height:1.7;white-space:pre-wrap">${escapeHtml(bodyText).replace(/\r?\n/g, "<br>")}</div>`;
  return { subject, bodyText, bodyHtml, usedFallback: !validation.valid, validation };
}

export async function readNotificationTemplate(env, templateKey, channel) {
  const database = requireDb(env);
  return database.prepare(`
    SELECT * FROM notification_templates
    WHERE template_key = ? AND channel = ?
    LIMIT 1
  `).bind(cleanText(templateKey, 120), cleanText(channel, 20)).first();
}

export async function readNotificationAdminSnapshot(env) {
  const database = requireDb(env);
  const [templateResult, outboxResult, revisionResult] = await Promise.all([
    database.prepare(`SELECT * FROM notification_templates ORDER BY area, name, channel`).all(),
    database.prepare(`SELECT * FROM notification_outbox ORDER BY created_at DESC LIMIT 100`).all(),
    database.prepare(`SELECT * FROM notification_template_revisions ORDER BY created_at DESC LIMIT 100`).all(),
  ]);
  return {
    templates: (templateResult?.results || []).map(formatTemplateRow),
    outbox: (outboxResult?.results || []).map(formatOutboxRow),
    revisions: (revisionResult?.results || []).map((row) => ({
      id: row.id,
      templateKey: row.template_key,
      channel: row.channel,
      action: row.action,
      actorId: row.actor_id || "",
      createdAt: row.created_at || "",
    })),
    variables: Object.entries(NOTIFICATION_VARIABLES).map(([key, value]) => ({ key, ...value })),
  };
}

function createRevisionStatement(database, template, action, actorId, subject, body, isEnabled, createdAt) {
  return database.prepare(`
    INSERT INTO notification_template_revisions (
      id, template_key, channel, action, subject, body, is_enabled, actor_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    createId("NTR"),
    template.template_key,
    template.channel,
    action,
    subject,
    body,
    isEnabled ? 1 : 0,
    cleanText(actorId, 120),
    createdAt,
  );
}

export async function saveNotificationDraft(env, input, actorId = "") {
  const database = requireDb(env);
  const template = await readNotificationTemplate(env, input.templateKey, input.channel);
  if (!template) throw Object.assign(new Error("알림 템플릿을 찾을 수 없습니다."), { status: 404 });
  const validation = validateNotificationTemplate(template, { channel: template.channel, subject: input.subject, body: input.body });
  if (!validation.valid) throw Object.assign(new Error(validation.errors.join("\n")), { status: 400, details: { errors: validation.errors } });
  const now = nowIso();
  await database.batch([
    database.prepare(`
      UPDATE notification_templates
      SET draft_subject = ?, draft_body = ?, updated_at = ?
      WHERE template_key = ? AND channel = ?
    `).bind(validation.subject, validation.body, now, template.template_key, template.channel),
    createRevisionStatement(database, template, "draft_saved", actorId, validation.subject, validation.body, Boolean(template.is_enabled), now),
  ]);
  return readNotificationAdminSnapshot(env);
}

export async function activateNotificationDraft(env, input, actorId = "") {
  const database = requireDb(env);
  const template = await readNotificationTemplate(env, input.templateKey, input.channel);
  if (!template) throw Object.assign(new Error("알림 템플릿을 찾을 수 없습니다."), { status: 404 });
  if (["shop", "workshop"].includes(template.area)) {
    throw Object.assign(new Error("Shop과 Workshop은 기존 발송 경로를 유지하는 전환 준비 템플릿입니다. 현재는 초안과 테스트만 사용할 수 있습니다."), { status: 409 });
  }
  const validation = validateNotificationTemplate(template, { channel: template.channel, subject: template.draft_subject, body: template.draft_body });
  if (!validation.valid) throw Object.assign(new Error(validation.errors.join("\n")), { status: 400, details: { errors: validation.errors } });
  const now = nowIso();
  await database.batch([
    database.prepare(`
      UPDATE notification_templates
      SET active_subject = draft_subject, active_body = draft_body, is_enabled = 1,
          activated_at = ?, updated_at = ?
      WHERE template_key = ? AND channel = ?
    `).bind(now, now, template.template_key, template.channel),
    createRevisionStatement(database, template, "activated", actorId, validation.subject, validation.body, true, now),
  ]);
  return readNotificationAdminSnapshot(env);
}

export async function restoreNotificationDefault(env, input, actorId = "") {
  const database = requireDb(env);
  const template = await readNotificationTemplate(env, input.templateKey, input.channel);
  if (!template) throw Object.assign(new Error("알림 템플릿을 찾을 수 없습니다."), { status: 404 });
  const now = nowIso();
  await database.batch([
    database.prepare(`
      UPDATE notification_templates
      SET draft_subject = default_subject, draft_body = default_body, updated_at = ?
      WHERE template_key = ? AND channel = ?
    `).bind(now, template.template_key, template.channel),
    createRevisionStatement(database, template, "default_restored", actorId, template.default_subject, template.default_body, Boolean(template.is_enabled), now),
  ]);
  return readNotificationAdminSnapshot(env);
}

export async function setNotificationTemplateEnabled(env, input, actorId = "") {
  const database = requireDb(env);
  const template = await readNotificationTemplate(env, input.templateKey, input.channel);
  if (!template) throw Object.assign(new Error("알림 템플릿을 찾을 수 없습니다."), { status: 404 });
  if (input.enabled && ["shop", "workshop"].includes(template.area)) {
    throw Object.assign(new Error("Shop과 Workshop은 기존 발송 경로를 유지하는 전환 준비 템플릿입니다. 활성화할 수 없습니다."), { status: 409 });
  }
  const now = nowIso();
  await database.batch([
    database.prepare(`
      UPDATE notification_templates SET is_enabled = ?, updated_at = ?
      WHERE template_key = ? AND channel = ?
    `).bind(input.enabled ? 1 : 0, now, template.template_key, template.channel),
    createRevisionStatement(database, template, input.enabled ? "enabled" : "disabled", actorId, template.active_subject, template.active_body, input.enabled, now),
  ]);
  return readNotificationAdminSnapshot(env);
}

export async function previewNotificationTemplate(env, input) {
  const template = await readNotificationTemplate(env, input.templateKey, input.channel);
  if (!template) throw Object.assign(new Error("알림 템플릿을 찾을 수 없습니다."), { status: 404 });
  const candidate = { ...template, draft_subject: input.subject ?? template.draft_subject, draft_body: input.body ?? template.draft_body };
  const validation = validateNotificationTemplate(candidate, { channel: template.channel, subject: candidate.draft_subject, body: candidate.draft_body });
  if (!validation.valid) throw Object.assign(new Error(validation.errors.join("\n")), { status: 400, details: { errors: validation.errors } });
  const payload = Object.fromEntries((decodeJson(template.allowed_variables_json, [])).map((variable) => [variable, NOTIFICATION_VARIABLES[variable]?.sample || variable]));
  const rendered = renderNotification(candidate, payload, "draft");
  return {
    subject: rendered.subject,
    body: rendered.bodyText,
    channel: template.channel,
    messageType: template.channel === "sms" ? getSolapiMessageType(rendered.bodyText) : null,
  };
}

export async function prepareNotification(env, input) {
  const template = await readNotificationTemplate(env, input.templateKey, input.channel);
  if (!template || !template.is_enabled) return null;
  const rendered = renderNotification(template, input.payload || {}, "active");
  const now = nowIso();
  return {
    id: input.id || createId("NOB"),
    eventKey: cleanText(input.eventKey, 240),
    entityType: cleanText(input.entityType, 40),
    entityId: cleanText(input.entityId, 120),
    channel: template.channel,
    recipient: cleanText(input.recipient, 320),
    templateKey: template.template_key,
    payload: input.payload || {},
    subject: rendered.subject,
    bodyText: rendered.bodyText,
    bodyHtml: rendered.bodyHtml,
    status: input.status || "pending",
    attempts: 0,
    availableAt: input.availableAt || now,
    lastError: input.lastError || null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createNotificationOutboxStatement(database, notification) {
  return database.prepare(`
    INSERT INTO notification_outbox (
      id, event_key, entity_type, entity_id, channel, recipient, template_key,
      payload_json, subject, body_text, body_html, status, attempts, available_at,
      last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    notification.id,
    notification.eventKey,
    notification.entityType,
    notification.entityId,
    notification.channel,
    notification.recipient,
    notification.templateKey,
    JSON.stringify(notification.payload || {}),
    notification.subject,
    notification.bodyText,
    notification.bodyHtml,
    notification.status || "pending",
    Number(notification.attempts || 0),
    notification.availableAt,
    notification.lastError,
    notification.createdAt,
    notification.updatedAt,
  );
}

function getSmsCountryAllowlist(env) {
  return new Set(cleanText(env?.SMS_COUNTRY_ALLOWLIST || "KR", 200).split(",").map((value) => value.trim().toUpperCase()).filter(Boolean));
}

export async function prepareRepairMilestoneNotifications(env, input) {
  const countryCode = cleanText(input.countryCode, 8).toUpperCase();
  const smsAllowed = getSmsCountryAllowlist(env).has(countryCode) && cleanText(input.phone, 40);
  const base = {
    entityType: "repair",
    entityId: input.repairId,
    templateKey: input.templateKey,
    payload: { ...input.payload, email: input.email },
  };
  const notifications = [];
  if (smsAllowed) {
    const sms = await prepareNotification(env, {
      ...base,
      eventKey: `${input.eventKey}:sms`,
      channel: "sms",
      recipient: input.phone,
    });
    if (sms) return [sms];
    const fallback = await prepareNotification(env, {
      ...base,
      eventKey: `${input.eventKey}:email-fallback`,
      channel: "email",
      recipient: input.email,
    });
    return fallback ? [fallback] : [];
  }
  const email = await prepareNotification(env, {
    ...base,
    eventKey: `${input.eventKey}:email`,
    channel: "email",
    recipient: input.email,
  });
  return email ? [email] : [];
}

export async function prepareTicketMessageNotification(env, input) {
  const notification = await prepareNotification(env, {
    eventKey: `${input.eventKey}:email`,
    entityType: "repair_ticket",
    entityId: input.ticketId,
    channel: "email",
    recipient: input.recipient,
    templateKey: input.templateKey,
    payload: input.payload,
  });
  return notification ? [notification] : [];
}

async function prepareSmsFallback(database, notification, now) {
  if (notification.fallback_outbox_id) return null;
  const payload = decodeJson(notification.payload_json, {});
  const emailRecipient = cleanText(payload.email, 320).toLowerCase();
  if (!EMAIL_PATTERN.test(emailRecipient)) return null;
  const template = await database.prepare(`
    SELECT * FROM notification_templates
    WHERE template_key = ? AND channel = 'email' AND is_enabled = 1
    LIMIT 1
  `).bind(notification.template_key).first();
  if (!template) return null;
  const rendered = renderNotification(template, payload, "active");
  const fallback = {
    id: createId("NOB"),
    eventKey: `${notification.event_key}:email-fallback`,
    entityType: notification.entity_type,
    entityId: notification.entity_id,
    channel: "email",
    recipient: emailRecipient,
    templateKey: notification.template_key,
    payload,
    subject: rendered.subject,
    bodyText: rendered.bodyText,
    bodyHtml: rendered.bodyHtml,
    status: "pending",
    attempts: 0,
    availableAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await database.batch([
      createNotificationOutboxStatement(database, fallback),
      database.prepare(`UPDATE notification_outbox SET fallback_outbox_id = ?, updated_at = ? WHERE id = ?`).bind(fallback.id, now, notification.id),
    ]);
    return fallback.id;
  } catch (error) {
    const existing = await database.prepare(`SELECT id FROM notification_outbox WHERE event_key = ? LIMIT 1`).bind(fallback.eventKey).first();
    if (existing) return existing.id;
    throw error;
  }
}

async function settleOutbox(database, notification, outcome, completedAt) {
  const attempts = Number(notification.attempts || 0) + 1;
  if (outcome.disposition === "sent" || outcome.disposition === "dry_run") {
    await database.prepare(`
      UPDATE notification_outbox
      SET status = 'sent', attempts = ?, provider_message_id = ?, last_error = NULL,
          locked_at = NULL, locked_by = NULL, sent_at = ?, updated_at = ?
      WHERE id = ? AND status = 'processing'
    `).bind(attempts, outcome.providerMessageId || null, completedAt, completedAt, notification.id).run();
    return "sent";
  }
  if (outcome.disposition === "unknown") {
    await database.prepare(`
      UPDATE notification_outbox SET status = 'unknown', attempts = ?, last_error = ?,
        locked_at = NULL, locked_by = NULL, updated_at = ? WHERE id = ? AND status = 'processing'
    `).bind(attempts, outcome.error, completedAt, notification.id).run();
    return "unknown";
  }
  if (outcome.disposition === "failed") {
    await database.prepare(`
      UPDATE notification_outbox SET status = 'failed', attempts = ?, last_error = ?,
        locked_at = NULL, locked_by = NULL, updated_at = ? WHERE id = ? AND status = 'processing'
    `).bind(attempts, outcome.error, completedAt, notification.id).run();
    return "failed";
  }
  if (attempts >= MAX_ATTEMPTS) {
    await database.prepare(`
      UPDATE notification_outbox SET status = 'dead_letter', attempts = ?, last_error = ?,
        locked_at = NULL, locked_by = NULL, updated_at = ? WHERE id = ? AND status = 'processing'
    `).bind(attempts, outcome.error, completedAt, notification.id).run();
    return "dead_letter";
  }
  const availableAt = nowIso(new Date(Date.parse(completedAt) + getBackoffMilliseconds(attempts)));
  await database.prepare(`
    UPDATE notification_outbox SET status = 'pending', attempts = ?, available_at = ?,
      last_error = ?, locked_at = NULL, locked_by = NULL, updated_at = ?
    WHERE id = ? AND status = 'processing'
  `).bind(attempts, availableAt, outcome.error, completedAt, notification.id).run();
  return "pending";
}

export async function processNotificationOutbox(env, options = {}) {
  const database = requireDb(env);
  const limit = Math.max(1, Math.min(50, Number(options.limit || 20)));
  const fetchImpl = options.fetchImpl || fetch;
  const workerId = cleanText(options.workerId, 120) || createId("NOW");
  const currentTime = options.now instanceof Date ? options.now : new Date();
  const currentIso = nowIso(currentTime);
  const staleIso = nowIso(new Date(currentTime.getTime() - LOCK_TIMEOUT_MS));
  await database.prepare(`
    UPDATE notification_outbox SET status = 'pending', locked_at = NULL, locked_by = NULL, updated_at = ?
    WHERE status = 'processing' AND locked_at < ?
  `).bind(currentIso, staleIso).run();

  const ids = Array.isArray(options.ids) ? options.ids.map((id) => cleanText(id, 80)).filter(Boolean) : [];
  const idClause = ids.length ? `AND id IN (${ids.map(() => "?").join(",")})` : "";
  const statement = database.prepare(`
    SELECT * FROM notification_outbox
    WHERE status = 'pending' AND available_at <= ? ${idClause}
    ORDER BY available_at, created_at
    LIMIT ?
  `);
  const result = ids.length ? await statement.bind(currentIso, ...ids, limit).all() : await statement.bind(currentIso, limit).all();
  const summary = { claimed: 0, sent: 0, pending: 0, failed: 0, unknown: 0, deadLetter: 0, fallback: 0 };
  for (const notification of result?.results || []) {
    const claim = await database.prepare(`
      UPDATE notification_outbox SET status = 'processing', locked_at = ?, locked_by = ?, updated_at = ?
      WHERE id = ? AND status = 'pending' AND available_at <= ?
    `).bind(currentIso, workerId, currentIso, notification.id, currentIso).run();
    if (readChanges(claim) !== 1) continue;
    summary.claimed += 1;
    const outcome = notification.channel === "sms"
      ? await sendSolapiNotification(env, notification, fetchImpl)
      : await sendResendNotification(env, notification, fetchImpl);
    const settled = await settleOutbox(database, notification, outcome, nowIso());
    if (settled === "dead_letter") summary.deadLetter += 1;
    else summary[settled] += 1;
    if (notification.channel === "sms" && ["dry_run", "failed", "unknown"].includes(outcome.disposition)) {
      if (await prepareSmsFallback(database, notification, nowIso())) summary.fallback += 1;
    }
    if (notification.channel === "sms" && settled === "dead_letter") {
      if (await prepareSmsFallback(database, notification, nowIso())) summary.fallback += 1;
    }
  }
  return summary;
}

export async function createManualNotificationRetry(env, outboxId, actorId = "") {
  const database = requireDb(env);
  const source = await database.prepare(`SELECT * FROM notification_outbox WHERE id = ? LIMIT 1`).bind(cleanText(outboxId, 80)).first();
  if (!source) throw Object.assign(new Error("재시도할 알림을 찾을 수 없습니다."), { status: 404 });
  const now = nowIso();
  const retry = {
    id: createId("NOB"),
    eventKey: `${source.event_key}:manual:${crypto.randomUUID()}`,
    entityType: source.entity_type,
    entityId: source.entity_id,
    channel: source.channel,
    recipient: source.recipient,
    templateKey: source.template_key,
    payload: decodeJson(source.payload_json, {}),
    subject: source.subject,
    bodyText: source.body_text,
    bodyHtml: source.body_html,
    status: "pending",
    attempts: 0,
    availableAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
  const template = await readNotificationTemplate(env, source.template_key, source.channel);
  await database.batch([
    createNotificationOutboxStatement(database, retry),
    createRevisionStatement(database, template, "manual_retry", actorId, source.subject, source.body_text, Boolean(template?.is_enabled), now),
  ]);
  return retry;
}

export async function createNotificationTest(env, input, actorId = "") {
  const template = await readNotificationTemplate(env, input.templateKey, input.channel);
  if (!template) throw Object.assign(new Error("알림 템플릿을 찾을 수 없습니다."), { status: 404 });
  const preview = await previewNotificationTemplate(env, input);
  const smsEnabled = String(env?.SMS_ENABLED || "false").toLowerCase() === "true";
  const smsDryRun = String(env?.SMS_DRY_RUN ?? "true").toLowerCase() !== "false";
  const testPhone = cleanText(env?.SOLAPI_TEST_PHONE, 40);
  if (template.channel === "sms" && smsEnabled && !smsDryRun && !testPhone) {
    throw Object.assign(new Error("실제 문자 테스트를 위해 SOLAPI_TEST_PHONE을 설정해주세요."), { status: 503 });
  }
  const recipient = template.channel === "sms"
    ? testPhone || "01000000000"
    : cleanText(env?.NOTIFICATION_TEST_EMAIL || env?.REPAIR_ADMIN_EMAIL, 320) || "studio.oalum@gmail.com";
  const payload = Object.fromEntries(decodeJson(template.allowed_variables_json, []).map((variable) => [variable, NOTIFICATION_VARIABLES[variable]?.sample || variable]));
  if (template.channel === "email") payload.email = recipient;
  const now = nowIso();
  const notification = {
    id: createId("NOB"),
    eventKey: `notification:test:${template.template_key}:${template.channel}:${crypto.randomUUID()}`,
    entityType: "notification_test",
    entityId: actorId || "admin",
    channel: template.channel,
    recipient,
    templateKey: template.template_key,
    payload,
    subject: preview.subject,
    bodyText: preview.body,
    bodyHtml: `<div style="font-family:Arial,sans-serif;line-height:1.7">${escapeHtml(preview.body).replace(/\r?\n/g, "<br>")}</div>`,
    status: "pending",
    attempts: 0,
    availableAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
  await requireDb(env).batch([createNotificationOutboxStatement(requireDb(env), notification)]);
  return notification;
}