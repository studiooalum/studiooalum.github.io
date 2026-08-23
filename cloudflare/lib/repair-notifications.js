const PRIMARY_REPAIR_STATUSES = [
  "received",
  "item_received",
  "in_progress",
  "payment_pending",
  "shipping",
  "closed",
];

const EXCEPTION_REPAIR_STATUSES = ["cancelled", "rejected"];
const REPAIR_STATUS_SET = new Set([...PRIMARY_REPAIR_STATUSES, ...EXCEPTION_REPAIR_STATUSES]);
const LEGACY_REPAIR_STATUS_ALIASES = {
  submitted: "received",
  reviewing: "item_received",
  quoted: "item_received",
  accepted: "in_progress",
  approved: "in_progress",
  completed: "payment_pending",
  ready: "in_progress",
  declined: "rejected",
  archived: "closed",
};

const STATUS_EVENT_TYPES = new Map(PRIMARY_REPAIR_STATUSES.map((status) => [status, `repair.${status}`]));
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEMPLATE_VARIABLE_PATTERN = /\{([A-Za-z][A-Za-z0-9]*)\}/g;
const MAX_ATTEMPTS = 5;
const LOCK_TIMEOUT_MS = 10 * 60 * 1000;
const SEND_TIMEOUT_MS = 12 * 1000;

export const REPAIR_STATUSES = Object.freeze([...PRIMARY_REPAIR_STATUSES, ...EXCEPTION_REPAIR_STATUSES]);
export const REPAIR_STATUS_LABELS = Object.freeze({
  received: "신청 완료",
  item_received: "수선제품 수신 완료",
  in_progress: "수선 진행 중",
  payment_pending: "수선 완료 · 가격 및 입금 안내",
  shipping: "입금 완료 · 배송 중",
  closed: "배송 완료 · Archive",
  cancelled: "취소",
  rejected: "진행 불가",
});

function cleanText(value, maxLength = 4000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function requireDb(env) {
  const database = env?.OALUM_DB;
  if (!database) {
    throw Object.assign(new Error("D1 바인딩이 아직 준비되지 않았습니다."), { status: 503 });
  }
  return database;
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").toUpperCase()}`;
}

function nowIso(date = new Date()) {
  return date.toISOString();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\r?\n/g, "<br>");
}

function normalizeSiteUrl(env) {
  const configured = cleanText(env?.PUBLIC_SITE_URL || env?.SITE_URL, 500).replace(/\/+$/, "");
  return configured || "https://studiooalum.com";
}

function formatAmount(value) {
  if (value === null || value === undefined || value === "") return "";
  const amount = Number(value);
  return Number.isFinite(amount) ? `${Math.round(amount).toLocaleString("ko-KR")}원` : "";
}

function readChanges(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function truncateProviderError(value) {
  return cleanText(value, 2000) || "이메일 제공업체가 오류를 반환했습니다.";
}

function getBackoffMilliseconds(attemptCount) {
  return Math.min(60 * 60 * 1000, 30 * 1000 * (2 ** Math.max(0, attemptCount - 1)));
}

function getRepairValue(request, camelKey, snakeKey = "") {
  if (request?.[camelKey] !== undefined) return request[camelKey];
  if (snakeKey && request?.[snakeKey] !== undefined) return request[snakeKey];
  return "";
}

export function normalizeRepairStatus(value, fallback = "received") {
  const raw = cleanText(value, 40).toLowerCase();
  const status = LEGACY_REPAIR_STATUS_ALIASES[raw] || raw;
  return REPAIR_STATUS_SET.has(status) ? status : fallback;
}

export function getRepairStatusEventType(status) {
  return STATUS_EVENT_TYPES.get(normalizeRepairStatus(status, "")) || "";
}

export function assertRepairStatusRequirements(statusValue, request) {
  const status = normalizeRepairStatus(statusValue);
  if (status === "payment_pending") {
    const finalAmount = getRepairValue(request, "finalAmount", "final_amount");
    const bankAccount = cleanText(getRepairValue(request, "bankAccount", "bank_account"), 500);
    const paymentInstructions = cleanText(getRepairValue(request, "paymentInstructions", "payment_instructions"), 2000);
    if (finalAmount === null || finalAmount === undefined || finalAmount === "") {
      throw Object.assign(new Error("최종 금액을 입력해주세요."), { status: 400 });
    }
    if (!bankAccount && !paymentInstructions) {
      throw Object.assign(new Error("입금 계좌 또는 결제 안내를 입력해주세요."), { status: 400 });
    }
  }
  if (status === "shipping") {
    const paymentConfirmedAt = cleanText(getRepairValue(request, "paymentConfirmedAt", "payment_confirmed_at"), 40);
    const carrier = cleanText(getRepairValue(request, "carrier"), 120);
    const trackingNumber = cleanText(getRepairValue(request, "trackingNumber", "tracking_number"), 160);
    if (!paymentConfirmedAt) {
      throw Object.assign(new Error("입금 확인일을 입력해주세요."), { status: 400 });
    }
    if (!carrier) {
      throw Object.assign(new Error("택배사를 입력해주세요."), { status: 400 });
    }
    if (!trackingNumber) {
      throw Object.assign(new Error("운송장 번호를 입력해주세요."), { status: 400 });
    }
  }
  return status;
}

export function createRepairEventId() {
  return createId("RPE");
}

export function createRepairOutboxId() {
  return createId("RNO");
}

export function buildRepairTemplateVariables(env, request, overrides = {}) {
  const requestNumber = cleanText(getRepairValue(request, "requestNumber", "request_number"), 80);
  const requestId = cleanText(getRepairValue(request, "id"), 80);
  const siteUrl = normalizeSiteUrl(env);
  const customerTicketUrl = `${siteUrl}/account.html?reference=${encodeURIComponent(requestNumber)}`;
  const adminTicketUrl = `${siteUrl}/repair-admin.html?repair=${encodeURIComponent(requestId)}`;

  return {
    customerName: cleanText(getRepairValue(request, "customerName", "customer_name"), 120),
    requestNumber,
    itemType: cleanText(getRepairValue(request, "itemType", "item_type"), 100),
    finalAmount: formatAmount(getRepairValue(request, "finalAmount", "final_amount")),
    bankAccount: cleanText(getRepairValue(request, "bankAccount", "bank_account"), 500),
    paymentInstructions: cleanText(getRepairValue(request, "paymentInstructions", "payment_instructions"), 2000),
    shippingAddress: cleanText(env?.REPAIR_SHIPPING_ADDRESS, 1000)
      || "서울특별시 동대문구 이문로 145 2층 201호 / 010-4746-5999 / 오알룸 앞",
    carrier: cleanText(getRepairValue(request, "carrier"), 120),
    trackingNumber: cleanText(getRepairValue(request, "trackingNumber", "tracking_number"), 160),
    trackingUrl: cleanText(getRepairValue(request, "trackingUrl", "tracking_url"), 1000),
    ticketUrl: customerTicketUrl,
    adminTicketUrl,
    inquiryMessage: "",
    inquiryCreatedAt: "",
    ...overrides,
  };
}

export function renderRepairTemplate(template, variables) {
  const missing = new Set();
  const render = (value, html = false) => String(value || "").replace(TEMPLATE_VARIABLE_PATTERN, (_, key) => {
    if (!Object.prototype.hasOwnProperty.call(variables, key) || variables[key] === null || variables[key] === undefined) {
      missing.add(key);
      return "";
    }
    return html ? escapeHtml(variables[key]) : String(variables[key]);
  });

  const subject = render(template?.subject_template || template?.subjectTemplate);
  const bodyText = render(template?.body_text_template || template?.bodyTextTemplate);
  const bodyHtml = render(template?.body_html_template || template?.bodyHtmlTemplate, true);
  return {
    subject,
    bodyText,
    bodyHtml,
    missingVariables: Array.from(missing),
  };
}

export async function readRepairNotificationTemplate(env, eventType, audience = "customer") {
  const database = requireDb(env);
  return database.prepare(`
    SELECT event_type, audience, subject_template, body_text_template, body_html_template, enabled, updated_at
    FROM repair_notification_templates
    WHERE event_type = ? AND audience = ?
    LIMIT 1
  `).bind(cleanText(eventType, 80), cleanText(audience, 20)).first();
}

export async function previewRepairNotification(env, request, eventType, overrides = {}, audience = "customer") {
  const template = await readRepairNotificationTemplate(env, eventType, audience);
  if (!template || !template.enabled) {
    throw Object.assign(new Error("해당 상태의 고객 안내 템플릿이 준비되지 않았습니다."), { status: 400 });
  }
  const variables = buildRepairTemplateVariables(env, request, overrides);
  if (audience === "admin") variables.ticketUrl = variables.adminTicketUrl;
  const rendered = renderRepairTemplate(template, variables);
  if (rendered.missingVariables.length) {
    throw Object.assign(new Error(`안내 템플릿 변수 누락: ${rendered.missingVariables.join(", ")}`), { status: 400 });
  }
  return rendered;
}

function createFailedRendering(eventType, reason) {
  return {
    subject: "수선 안내 발송 준비 실패",
    bodyText: reason,
    bodyHtml: `<p>${escapeHtml(reason)}</p>`,
    status: "failed",
    lastError: reason,
    eventType,
  };
}

async function prepareAudienceNotification(env, request, eventId, eventType, audience, overrides = {}) {
  const template = await readRepairNotificationTemplate(env, eventType, audience);
  const recipient = audience === "admin"
    ? cleanText(env?.REPAIR_ADMIN_EMAIL, 320) || "studio.oalum@gmail.com"
    : cleanText(getRepairValue(request, "email"), 320).toLowerCase();
  const variables = buildRepairTemplateVariables(env, request, overrides);
  if (audience === "admin") variables.ticketUrl = variables.adminTicketUrl;

  let rendered;
  let status = "pending";
  let lastError = null;
  if (!template || !template.enabled) {
    rendered = createFailedRendering(eventType, "고객 안내 템플릿이 없거나 비활성화되어 있습니다.");
    status = rendered.status;
    lastError = rendered.lastError;
  } else {
    rendered = renderRepairTemplate(template, variables);
    if (rendered.missingVariables.length) {
      const failed = createFailedRendering(eventType, `안내 템플릿 변수 누락: ${rendered.missingVariables.join(", ")}`);
      rendered = failed;
      status = failed.status;
      lastError = failed.lastError;
    } else if (!EMAIL_PATTERN.test(recipient)) {
      status = "failed";
      lastError = "수신 이메일 주소 형식이 올바르지 않습니다.";
    }
  }

  const requestId = cleanText(getRepairValue(request, "id"), 80);
  const suffix = eventType === "repair.customer_inquiry"
    ? `inquiry:${cleanText(overrides.inquiryId, 80)}:email`
    : audience === "admin"
      ? `status:${eventId}:admin:email`
      : `status:${eventId}:email`;
  const createdAt = nowIso();
  return {
    id: createRepairOutboxId(),
    repairRequestId: requestId,
    eventId,
    eventKey: `repair:${requestId}:${suffix}`,
    eventType,
    recipient,
    subject: rendered.subject,
    bodyText: rendered.bodyText,
    bodyHtml: rendered.bodyHtml,
    status,
    attemptCount: 0,
    availableAt: createdAt,
    lastError,
    createdAt,
    updatedAt: createdAt,
  };
}

export async function prepareRepairNotifications(env, request, eventId, eventType, overrides = {}) {
  const audiences = eventType === "repair.received"
    ? ["customer", "admin"]
    : eventType === "repair.customer_inquiry"
      ? ["admin"]
      : ["customer"];
  return Promise.all(audiences.map((audience) => prepareAudienceNotification(
    env,
    request,
    eventId,
    eventType,
    audience,
    overrides,
  )));
}

export function createRepairEventStatement(database, event) {
  return database.prepare(`
    INSERT INTO repair_events (
      id, repair_request_id, request_version, event_type, previous_status, next_status,
      actor_type, actor_id, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    cleanText(event.id, 80),
    cleanText(event.repairRequestId, 80),
    event.requestVersion ?? null,
    cleanText(event.eventType, 80),
    event.previousStatus ? cleanText(event.previousStatus, 40) : null,
    event.nextStatus ? cleanText(event.nextStatus, 40) : null,
    cleanText(event.actorType || "system", 40),
    cleanText(event.actorId, 120),
    JSON.stringify(event.payload || {}),
    cleanText(event.createdAt, 40) || nowIso(),
  );
}

export function createRepairOutboxStatement(database, notification) {
  return database.prepare(`
    INSERT INTO repair_notification_outbox (
      id, repair_request_id, event_id, event_key, event_type, channel, recipient,
      subject, body_text, body_html, status, attempt_count, available_at,
      last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'email', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    notification.id,
    notification.repairRequestId,
    notification.eventId,
    notification.eventKey,
    notification.eventType,
    notification.recipient,
    notification.subject,
    notification.bodyText,
    notification.bodyHtml,
    notification.status || "pending",
    Number(notification.attemptCount || 0),
    notification.availableAt,
    notification.lastError || null,
    notification.createdAt,
    notification.updatedAt,
  );
}

async function sendResendEmail(env, notification, fetchImpl) {
  const apiKey = cleanText(env?.RESEND_API_KEY, 1000);
  const from = cleanText(env?.RESEND_FROM_EMAIL, 320);
  if (!apiKey) return { disposition: "failed", error: "RESEND_API_KEY가 설정되지 않았습니다." };
  if (!from) return { disposition: "failed", error: "RESEND_FROM_EMAIL이 설정되지 않았습니다." };
  if (!EMAIL_PATTERN.test(notification.recipient)) {
    return { disposition: "failed", error: "수신 이메일 주소 형식이 올바르지 않습니다." };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": notification.event_key,
      },
      body: JSON.stringify({
        from,
        to: [notification.recipient],
        subject: notification.subject,
        text: notification.body_text,
        html: notification.body_html,
      }),
      signal: controller.signal,
    });
    const rawBody = await response.text();
    let payload = null;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      payload = null;
    }

    if (response.ok) {
      return {
        disposition: "sent",
        providerMessageId: cleanText(payload?.id, 240) || null,
      };
    }
    if (response.status === 429 || response.status >= 500 || response.status === 408) {
      return { disposition: "retry", error: truncateProviderError(payload?.message || rawBody || `Resend ${response.status}`) };
    }
    return { disposition: "failed", error: truncateProviderError(payload?.message || rawBody || `Resend ${response.status}`) };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { disposition: "unknown", error: "Resend 요청이 timeout되어 전달 여부를 확인할 수 없습니다." };
    }
    return { disposition: "retry", error: truncateProviderError(error?.message || "Resend 네트워크 오류") };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function settleNotification(database, notification, outcome, completedAt) {
  const attemptCount = Number(notification.attempt_count || 0) + 1;
  if (outcome.disposition === "sent") {
    await database.prepare(`
      UPDATE repair_notification_outbox
      SET status = 'sent', attempt_count = ?, provider_message_id = ?, last_error = NULL,
          locked_at = NULL, locked_by = NULL, sent_at = ?, updated_at = ?
      WHERE id = ? AND status = 'processing'
    `).bind(attemptCount, outcome.providerMessageId, completedAt, completedAt, notification.id).run();
    return "sent";
  }

  if (outcome.disposition === "unknown") {
    await database.prepare(`
      UPDATE repair_notification_outbox
      SET status = 'unknown', attempt_count = ?, last_error = ?, locked_at = NULL,
          locked_by = NULL, updated_at = ?
      WHERE id = ? AND status = 'processing'
    `).bind(attemptCount, outcome.error, completedAt, notification.id).run();
    return "unknown";
  }

  if (outcome.disposition === "failed") {
    await database.prepare(`
      UPDATE repair_notification_outbox
      SET status = 'failed', attempt_count = ?, last_error = ?, locked_at = NULL,
          locked_by = NULL, updated_at = ?
      WHERE id = ? AND status = 'processing'
    `).bind(attemptCount, outcome.error, completedAt, notification.id).run();
    return "failed";
  }

  if (attemptCount >= MAX_ATTEMPTS) {
    await database.prepare(`
      UPDATE repair_notification_outbox
      SET status = 'dead_letter', attempt_count = ?, last_error = ?, locked_at = NULL,
          locked_by = NULL, updated_at = ?
      WHERE id = ? AND status = 'processing'
    `).bind(attemptCount, outcome.error, completedAt, notification.id).run();
    return "dead_letter";
  }

  const availableAt = nowIso(new Date(Date.parse(completedAt) + getBackoffMilliseconds(attemptCount)));
  await database.prepare(`
    UPDATE repair_notification_outbox
    SET status = 'pending', attempt_count = ?, available_at = ?, last_error = ?,
        locked_at = NULL, locked_by = NULL, updated_at = ?
    WHERE id = ? AND status = 'processing'
  `).bind(attemptCount, availableAt, outcome.error, completedAt, notification.id).run();
  return "pending";
}

export async function processRepairNotificationOutbox(env, options = {}) {
  const database = requireDb(env);
  const fetchImpl = options.fetchImpl || fetch;
  const limit = Math.max(1, Math.min(25, Number(options.limit || 10)));
  const workerId = cleanText(options.workerId, 120) || createId("RNW");
  const currentTime = options.now instanceof Date ? options.now : new Date();
  const currentIso = nowIso(currentTime);
  const staleIso = nowIso(new Date(currentTime.getTime() - LOCK_TIMEOUT_MS));

  await database.prepare(`
    UPDATE repair_notification_outbox
    SET status = 'pending', locked_at = NULL, locked_by = NULL, updated_at = ?
    WHERE status = 'processing' AND locked_at IS NOT NULL AND locked_at < ?
  `).bind(currentIso, staleIso).run();

  const ids = Array.isArray(options.ids) ? options.ids.map((id) => cleanText(id, 80)).filter(Boolean) : [];
  const whereIds = ids.length ? `AND id IN (${ids.map(() => "?").join(", ")})` : "";
  const query = database.prepare(`
    SELECT * FROM repair_notification_outbox
    WHERE status = 'pending' AND available_at <= ? ${whereIds}
    ORDER BY available_at ASC, created_at ASC
    LIMIT ?
  `);
  const result = ids.length
    ? await query.bind(currentIso, ...ids, limit).all()
    : await query.bind(currentIso, limit).all();

  const summary = { claimed: 0, sent: 0, pending: 0, failed: 0, unknown: 0, deadLetter: 0 };
  for (const notification of result?.results || []) {
    const claim = await database.prepare(`
      UPDATE repair_notification_outbox
      SET status = 'processing', locked_at = ?, locked_by = ?, updated_at = ?
      WHERE id = ? AND status = 'pending' AND available_at <= ?
    `).bind(currentIso, workerId, currentIso, notification.id, currentIso).run();
    if (readChanges(claim) !== 1) continue;
    summary.claimed += 1;

    const outcome = await sendResendEmail(env, notification, fetchImpl);
    const settled = await settleNotification(database, notification, outcome, nowIso());
    if (settled === "dead_letter") summary.deadLetter += 1;
    else if (Object.prototype.hasOwnProperty.call(summary, settled)) summary[settled] += 1;
  }
  return summary;
}

export async function createManualRepairNotificationResend(env, outboxId, actor = {}) {
  const database = requireDb(env);
  const source = await database.prepare(`
    SELECT o.*, r.status AS repair_status
    FROM repair_notification_outbox o
    INNER JOIN repair_requests r ON r.id = o.repair_request_id
    WHERE o.id = ?
    LIMIT 1
  `).bind(cleanText(outboxId, 80)).first();
  if (!source) {
    throw Object.assign(new Error("재발송할 안내 기록을 찾을 수 없습니다."), { status: 404 });
  }
  if (normalizeRepairStatus(source.repair_status) === "closed") {
    throw Object.assign(new Error("배송 완료된 수선 내역에는 새 안내를 생성할 수 없습니다."), { status: 409 });
  }

  const eventId = createRepairEventId();
  const notificationId = createRepairOutboxId();
  const createdAt = nowIso();
  const eventKey = `repair:${source.repair_request_id}:manual_resend:${eventId}:email`;
  const eventStatement = createRepairEventStatement(database, {
    id: eventId,
    repairRequestId: source.repair_request_id,
    requestVersion: null,
    eventType: "repair.manual_resend",
    actorType: actor.type || "admin",
    actorId: actor.id || "",
    payload: { sourceOutboxId: source.id, sourceEventId: source.event_id },
    createdAt,
  });
  const outboxStatement = database.prepare(`
    INSERT INTO repair_notification_outbox (
      id, repair_request_id, event_id, event_key, event_type, channel, recipient,
      subject, body_text, body_html, status, attempt_count, available_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'repair.manual_resend', 'email', ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
  `).bind(
    notificationId,
    source.repair_request_id,
    eventId,
    eventKey,
    source.recipient,
    source.subject,
    source.body_text,
    source.body_html,
    createdAt,
    createdAt,
    createdAt,
  );
  await database.batch([eventStatement, outboxStatement]);
  return { eventId, notificationId, eventKey };
}