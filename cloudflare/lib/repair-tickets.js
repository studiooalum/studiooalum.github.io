import {
  createNotificationOutboxStatement,
  prepareRepairMilestoneNotifications,
  prepareTicketMessageNotification,
} from "./notifications.js";
import { REPAIR_STATUS_LABELS, normalizeRepairStatus } from "./repair-notifications.js";
import { createRepairTicketAccessToken } from "./repair-ticket-tokens.js";

const MESSAGE_LIMIT = 4000;
const MESSAGE_RATE_WINDOW_MS = 60 * 1000;
const MESSAGE_RATE_LIMIT = 10;
const DUPLICATE_WINDOW_MS = 30 * 1000;

function cleanText(value, maxLength = MESSAGE_LIMIT) {
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

function decodeJson(value, fallback = {}) {
  try {
    return JSON.parse(value || "") ?? fallback;
  } catch {
    return fallback;
  }
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function formatAmount(value) {
  if (value === null || value === undefined || value === "") return "";
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function normalizeSiteUrl(env) {
  return cleanText(env?.PUBLIC_SITE_URL || env?.SITE_URL, 500).replace(/\/+$/, "") || "https://studiooalum.com";
}

function sanitizeMessageBody(value) {
  const stripped = String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  if (!stripped) throw Object.assign(new Error("메시지 내용을 입력해주세요."), { status: 400 });
  if (stripped.length > MESSAGE_LIMIT) throw Object.assign(new Error(`메시지는 ${MESSAGE_LIMIT.toLocaleString("ko-KR")}자 이하로 입력해주세요.`), { status: 400 });
  return stripped;
}

async function buildTicketUrl(env, ticketId) {
  const accessToken = await createRepairTicketAccessToken(env, ticketId);
  return `${normalizeSiteUrl(env)}/repair-ticket.html?ticket=${encodeURIComponent(ticketId)}&access=${encodeURIComponent(accessToken)}`;
}

function formatAttachment(row) {
  return {
    id: row.id,
    filename: row.original_filename || "",
    contentType: row.content_type || "",
    byteSize: Number(row.byte_size || 0),
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at || "",
    streamPath: `/api/repairs/ticket-attachments/${encodeURIComponent(row.id)}`,
  };
}

function formatMessage(row) {
  return {
    id: row.id,
    authorType: row.author_type,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at || "",
    attachments: [],
  };
}

function formatTicketHeader(row) {
  const repairStatus = normalizeRepairStatus(row.repair_status);
  return {
    id: row.id,
    repairId: row.repair_id,
    status: row.status,
    unreadCustomerCount: Number(row.unread_customer_count || 0),
    unreadAdminCount: Number(row.unread_admin_count || 0),
    lastMessageAt: row.last_message_at || "",
    closedAt: row.closed_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    repair: {
      requestNumber: row.request_number,
      customerName: row.customer_name,
      itemType: row.item_type,
      issueDescription: row.repair_details,
      status: repairStatus,
      statusLabel: REPAIR_STATUS_LABELS[repairStatus] || repairStatus,
      finalAmount: row.final_amount == null ? null : Number(row.final_amount),
      bankAccount: row.bank_account || "",
      paymentInstructions: row.payment_instructions || "",
      paymentConfirmedAt: row.payment_confirmed_at || "",
      carrier: row.carrier || "",
      trackingNumber: row.tracking_number || "",
      trackingUrl: row.tracking_url || "",
      createdAt: row.repair_created_at || "",
      updatedAt: row.repair_updated_at || "",
    },
    messages: [],
  };
}

export function createRepairTicketId() {
  return createId("RPT");
}

export function createRepairTicketMessageId() {
  return createId("RTM");
}

export function createRepairTicketAttachmentId() {
  return createId("RTA");
}

export function createRepairTicketStatement(database, input) {
  return database.prepare(`
    INSERT INTO repair_tickets (
      id, repair_id, customer_id, status, unread_customer_count, unread_admin_count,
      last_message_at, closed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.id,
    input.repairId,
    input.customerId || null,
    input.status || "open",
    Number(input.unreadCustomerCount || 0),
    Number(input.unreadAdminCount || 0),
    input.lastMessageAt || null,
    input.closedAt || null,
    input.createdAt,
    input.updatedAt,
  );
}

export function createRepairTicketMessageStatement(database, input) {
  return database.prepare(`
    INSERT INTO repair_ticket_messages (
      id, ticket_id, client_message_id, source_event_id, author_type,
      body, message_hash, created_at, read_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.id,
    input.ticketId,
    input.clientMessageId || null,
    input.sourceEventId || null,
    input.authorType,
    input.body,
    input.messageHash || "",
    input.createdAt,
    input.readAt || null,
  );
}

export function createRepairTicketAttachmentStatement(database, input) {
  return database.prepare(`
    INSERT INTO repair_ticket_message_attachments (
      id, message_id, r2_key, original_filename, content_type, byte_size, sort_order, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.id,
    input.messageId,
    input.r2Key,
    input.filename,
    input.contentType,
    Number(input.byteSize || 0),
    Number(input.sortOrder || 0),
    input.createdAt,
  );
}

export async function readRepairTicketById(env, ticketId) {
  const database = requireDb(env);
  const id = cleanText(ticketId, 80);
  const row = await database.prepare(`
    SELECT
      t.*,
      r.request_number,
      r.customer_name,
      r.email,
      r.phone,
      r.country_code,
      r.item_type,
      r.repair_details,
      r.status AS repair_status,
      r.final_amount,
      r.bank_account,
      r.payment_instructions,
      r.payment_confirmed_at,
      r.carrier,
      r.tracking_number,
      r.tracking_url,
      r.created_at AS repair_created_at,
      r.updated_at AS repair_updated_at
    FROM repair_tickets t
    INNER JOIN repair_requests r ON r.id = t.repair_id
    WHERE t.id = ?
    LIMIT 1
  `).bind(id).first();
  if (!row) throw Object.assign(new Error("Repair Ticket을 찾을 수 없습니다."), { status: 404 });

  const ticket = formatTicketHeader(row);
  const messageResult = await database.prepare(`
    SELECT * FROM repair_ticket_messages
    WHERE ticket_id = ?
    ORDER BY created_at ASC, id ASC
  `).bind(id).all();
  const messages = (messageResult?.results || []).map(formatMessage);
  const byId = new Map(messages.map((message) => [message.id, message]));
  if (messages.length) {
    const placeholders = messages.map(() => "?").join(",");
    const attachmentResult = await database.prepare(`
      SELECT * FROM repair_ticket_message_attachments
      WHERE message_id IN (${placeholders})
      ORDER BY sort_order ASC, created_at ASC
    `).bind(...messages.map((message) => message.id)).all();
    for (const attachment of attachmentResult?.results || []) {
      byId.get(attachment.message_id)?.attachments.push(formatAttachment(attachment));
    }
  }
  ticket.messages = messages;
  return { ticket, source: row };
}

export async function readRepairTicketForRepair(env, repairId) {
  const database = requireDb(env);
  const row = await database.prepare(`SELECT id FROM repair_tickets WHERE repair_id = ? LIMIT 1`).bind(cleanText(repairId, 80)).first();
  return row ? readRepairTicketById(env, row.id) : null;
}

export async function markRepairTicketRead(env, ticketId, viewerType) {
  const database = requireDb(env);
  const now = nowIso();
  if (viewerType === "admin") {
    await database.batch([
      database.prepare(`UPDATE repair_ticket_messages SET read_at = COALESCE(read_at, ?) WHERE ticket_id = ? AND author_type = 'customer'`).bind(now, ticketId),
      database.prepare(`UPDATE repair_tickets SET unread_admin_count = 0, updated_at = ? WHERE id = ?`).bind(now, ticketId),
    ]);
  } else {
    await database.batch([
      database.prepare(`UPDATE repair_ticket_messages SET read_at = COALESCE(read_at, ?) WHERE ticket_id = ? AND author_type IN ('admin', 'system')`).bind(now, ticketId),
      database.prepare(`UPDATE repair_tickets SET unread_customer_count = 0, updated_at = ? WHERE id = ?`).bind(now, ticketId),
    ]);
  }
}

async function buildNotificationPayload(env, source, ticket, overrides = {}) {
  const value = (camelKey, snakeKey = camelKey) => source?.[camelKey] ?? source?.[snakeKey] ?? "";
  return {
    customer_name: value("customerName", "customer_name"),
    product_name: value("itemType", "item_type"),
    repair_number: value("requestNumber", "request_number"),
    final_amount: formatAmount(value("finalAmount", "final_amount")),
    tracking_number: value("trackingNumber", "tracking_number"),
    tracking_url: value("trackingUrl", "tracking_url"),
    repair_url: `${normalizeSiteUrl(env)}/account.html`,
    repair_ticket_url: await buildTicketUrl(env, ticket.id),
    studio_address: cleanText(env?.REPAIR_SHIPPING_ADDRESS, 1000) || "서울특별시 동대문구 이문로 145 2층 201호",
    repair_status: REPAIR_STATUS_LABELS[normalizeRepairStatus(value("status", "repair_status"))] || "",
    email: value("email"),
    ...overrides,
  };
}

function getStatusSystemMessage(status) {
  const labels = REPAIR_STATUS_LABELS;
  if (status === "item_received") return "수선 제품을 정상적으로 받았습니다.";
  if (status === "in_progress") return "수선 작업을 시작했습니다.";
  if (status === "payment_pending") return "수선 작업이 완료되어 최종 가격과 결제 안내가 등록되었습니다.";
  if (status === "shipping") return "입금을 확인하고 수선 제품 배송을 시작했습니다.";
  if (status === "closed") return "수선 제품 배송이 완료되어 Ticket이 종료되었습니다.";
  if (status === "cancelled") return "수선 신청이 취소되었습니다.";
  if (status === "rejected") return "수선 진행이 어려운 상태로 변경되었습니다.";
  return `수선 상태가 ${labels[status] || status}로 변경되었습니다.`;
}

function getMilestoneTemplate(status) {
  if (status === "item_received") return "repair.received";
  if (status === "payment_pending") return "repair.repair_completed_quote_ready";
  if (status === "shipping") return "repair.payment_confirmed_shipping_started";
  return "";
}

export async function prepareInitialRepairTicketBundle(env, request, eventId, createdAt) {
  const database = requireDb(env);
  const ticketId = createRepairTicketId();
  const messageId = createRepairTicketMessageId();
  const ticket = { id: ticketId };
  const payload = await buildNotificationPayload(env, {
    ...request,
    repair_status: "received",
  }, ticket);
  const notifications = await prepareRepairMilestoneNotifications(env, {
    repairId: request.id,
    templateKey: "repair.application_submitted",
    eventKey: `repair:${request.id}:application_submitted:v1`,
    countryCode: request.countryCode || "",
    phone: request.phone,
    email: request.email,
    payload,
  });
  return {
    ticketId,
    messageId,
    notifications,
    statements: [
      createRepairTicketStatement(database, {
        id: ticketId,
        repairId: request.id,
        customerId: request.customerId,
        unreadCustomerCount: 1,
        lastMessageAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      }),
      createRepairTicketMessageStatement(database, {
        id: messageId,
        ticketId,
        sourceEventId: eventId,
        authorType: "system",
        body: "수선 신청이 완료되었습니다. 제품을 보내주시면 도착 확인 후 Ticket에서 진행 상황을 안내드립니다.",
        createdAt,
      }),
      ...notifications.map((notification) => createNotificationOutboxStatement(database, notification)),
    ],
  };
}

export async function prepareRepairStatusTicketBundle(env, request, eventId, previousStatus, nextStatus, createdAt) {
  const database = requireDb(env);
  const ticketResult = await readRepairTicketForRepair(env, request.id);
  if (!ticketResult) throw Object.assign(new Error("Repair Ticket을 찾을 수 없습니다."), { status: 409 });
  const { ticket, source } = ticketResult;
  const messageId = createRepairTicketMessageId();
  const payload = await buildNotificationPayload(env, {
    ...source,
    ...request,
    repair_status: nextStatus,
  }, ticket);
  const milestoneTemplate = getMilestoneTemplate(nextStatus);
  const eventKey = `repair:${request.id}:${milestoneTemplate || `status:${nextStatus}`}:v${request.version}`;
  const notifications = milestoneTemplate
    ? await prepareRepairMilestoneNotifications(env, {
      repairId: request.id,
      templateKey: milestoneTemplate,
      eventKey,
      countryCode: request.countryCode || source.country_code || "",
      phone: request.phone || source.phone,
      email: request.email || source.email,
      payload,
    })
    : await prepareTicketMessageNotification(env, {
      eventKey,
      ticketId: ticket.id,
      templateKey: "ticket.system_message_to_customer",
      recipient: request.email || source.email,
      payload,
    });
  const closesTicket = nextStatus === "closed";
  return {
    ticketId: ticket.id,
    messageId,
    notifications,
    statements: [
      createRepairTicketMessageStatement(database, {
        id: messageId,
        ticketId: ticket.id,
        sourceEventId: eventId,
        authorType: "system",
        body: getStatusSystemMessage(nextStatus),
        createdAt,
      }),
      database.prepare(`
        UPDATE repair_tickets
        SET status = ?, unread_customer_count = unread_customer_count + 1,
            last_message_at = ?, closed_at = ?, updated_at = ?
        WHERE id = ? AND status = 'open'
      `).bind(closesTicket ? "closed" : "open", createdAt, closesTicket ? createdAt : null, createdAt, ticket.id),
      ...notifications.map((notification) => createNotificationOutboxStatement(database, notification)),
    ],
  };
}

async function claimTicketRateSlot(database, input) {
  const bucket = String(Math.floor(Date.now() / MESSAGE_RATE_WINDOW_MS));
  for (let slot = 1; slot <= MESSAGE_RATE_LIMIT; slot += 1) {
    try {
      await database.prepare(`
        INSERT INTO repair_ticket_rate_slots (
          ticket_id, actor_type, client_key, window_bucket, slot, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).bind(input.ticketId, input.actorType, input.clientKey, bucket, slot, input.createdAt).run();
      return true;
    } catch (error) {
      if (/unique|constraint/i.test(String(error?.message || ""))) continue;
      throw error;
    }
  }
  return false;
}

async function writeAbuseLog(database, input) {
  await database.prepare(`
    INSERT INTO repair_ticket_abuse_log (id, ticket_id, actor_type, client_key, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(createId("RAB"), input.ticketId || null, input.actorType, input.clientKey, input.reason, nowIso()).run();
}

export async function createRepairTicketMessage(env, input, attachments = []) {
  const database = requireDb(env);
  const ticketResult = await readRepairTicketById(env, input.ticketId);
  const { ticket, source } = ticketResult;
  if (ticket.status === "closed") throw Object.assign(new Error("종료된 Repair Ticket에는 새 메시지를 작성할 수 없습니다."), { status: 409 });
  const clientMessageId = cleanText(input.clientMessageId, 120);
  if (!clientMessageId) throw Object.assign(new Error("메시지 요청 키가 필요합니다."), { status: 400 });
  const duplicate = await database.prepare(`SELECT id FROM repair_ticket_messages WHERE client_message_id = ? LIMIT 1`).bind(clientMessageId).first();
  if (duplicate) return { duplicate: true, messageId: duplicate.id, notificationIds: [] };

  const body = sanitizeMessageBody(input.body);
  const actorType = input.authorType === "admin" ? "admin" : "customer";
  const clientKey = cleanText(input.clientKey, 128) || "unknown";
  const messageHash = await sha256(`${ticket.id}|${actorType}|${body}`);
  const duplicateSince = nowIso(new Date(Date.now() - DUPLICATE_WINDOW_MS));
  const repeated = await database.prepare(`
    SELECT id FROM repair_ticket_messages
    WHERE ticket_id = ? AND author_type = ? AND message_hash = ? AND created_at >= ?
    LIMIT 1
  `).bind(ticket.id, actorType, messageHash, duplicateSince).first();
  if (repeated) {
    await writeAbuseLog(database, { ticketId: ticket.id, actorType, clientKey, reason: "duplicate_message" });
    throw Object.assign(new Error("같은 메시지가 반복되어 전송되지 않았습니다."), { status: 429 });
  }

  const messageId = cleanText(input.messageId, 80) || createRepairTicketMessageId();
  const createdAt = nowIso();
  const rateClaimed = await claimTicketRateSlot(database, { ticketId: ticket.id, actorType, clientKey, createdAt });
  if (!rateClaimed) {
    await writeAbuseLog(database, { ticketId: ticket.id, actorType, clientKey, reason: "rate_limit" });
    throw Object.assign(new Error("메시지 전송이 너무 빠릅니다. 잠시 후 다시 시도해주세요."), { status: 429 });
  }
  const payload = await buildNotificationPayload(env, source, ticket);
  const templateKey = actorType === "customer" ? "ticket.customer_message_to_admin" : "ticket.admin_message_to_customer";
  const recipient = actorType === "customer"
    ? cleanText(env?.REPAIR_ADMIN_EMAIL, 320) || "studio.oalum@gmail.com"
    : source.email;
  const notifications = await prepareTicketMessageNotification(env, {
    eventKey: `repair:${ticket.repairId}:ticket_message:${messageId}:v1`,
    ticketId: ticket.id,
    templateKey,
    recipient,
    payload,
  });
  const statements = [
    createRepairTicketMessageStatement(database, {
      id: messageId,
      ticketId: ticket.id,
      clientMessageId,
      authorType: actorType,
      body,
      messageHash,
      createdAt,
    }),
    ...attachments.map((attachment, index) => createRepairTicketAttachmentStatement(database, {
      ...attachment,
      messageId,
      sortOrder: Number.isInteger(attachment.sortOrder) ? attachment.sortOrder : index,
      createdAt,
    })),
    database.prepare(`
      UPDATE repair_tickets
      SET unread_customer_count = unread_customer_count + ?,
          unread_admin_count = unread_admin_count + ?,
          last_message_at = ?, updated_at = ?
      WHERE id = ? AND status = 'open'
    `).bind(actorType === "admin" ? 1 : 0, actorType === "customer" ? 1 : 0, createdAt, createdAt, ticket.id),
    ...notifications.map((notification) => createNotificationOutboxStatement(database, notification)),
  ];
  try {
    await database.batch(statements);
  } catch (error) {
    const existing = await database.prepare(`SELECT id FROM repair_ticket_messages WHERE client_message_id = ? LIMIT 1`).bind(clientMessageId).first();
    if (existing) return { duplicate: true, messageId: existing.id, notificationIds: [] };
    if (/repair_ticket_closed/i.test(String(error?.message || ""))) {
      throw Object.assign(new Error("종료된 Repair Ticket에는 새 메시지를 작성할 수 없습니다."), { status: 409 });
    }
    if (/unique|constraint/i.test(String(error?.message || ""))) {
      await writeAbuseLog(database, { ticketId: ticket.id, actorType, clientKey, reason: "concurrent_rate_limit" });
      throw Object.assign(new Error("메시지 전송이 너무 빠릅니다. 잠시 후 다시 시도해주세요."), { status: 429 });
    }
    throw error;
  }
  return { duplicate: false, messageId, notificationIds: notifications.map((notification) => notification.id) };
}

export async function readRepairTicketAttachment(env, attachmentId) {
  const database = requireDb(env);
  const row = await database.prepare(`
    SELECT a.*, m.ticket_id
    FROM repair_ticket_message_attachments a
    INNER JOIN repair_ticket_messages m ON m.id = a.message_id
    WHERE a.id = ?
    LIMIT 1
  `).bind(cleanText(attachmentId, 80)).first();
  if (!row) throw Object.assign(new Error("첨부 이미지를 찾을 수 없습니다."), { status: 404 });
  return {
    id: row.id,
    ticketId: row.ticket_id,
    r2Key: row.r2_key,
    filename: row.original_filename,
    contentType: row.content_type,
  };
}