import {
  assertRepairStatusRequirements,
  createRepairEventId,
  createRepairEventStatement,
  createRepairOutboxStatement,
  normalizeRepairStatus,
  prepareRepairNotifications,
  REPAIR_STATUS_LABELS,
} from "./repair-notifications.js";
import {
  prepareInitialRepairTicketBundle,
  prepareRepairStatusTicketBundle,
} from "./repair-tickets.js";
import { normalizeImageRgb } from "./image-colors.js";
import { buildRepairGalleryUrl } from "./r2.js";

function getDb(env) {
  return env?.OALUM_DB || null;
}

function requireDb(env) {
  const database = getDb(env);
  if (!database) {
    throw Object.assign(new Error("D1 바인딩이 아직 준비되지 않았습니다."), { status: 503 });
  }
  return database;
}

function cleanText(value, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return cleanText(value, 320).toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").toUpperCase()}`;
}

function createRequestNumber(date = new Date()) {
  const day = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `REP-${day}-${suffix}`;
}

function normalizeStatus(value, fallback = "received") {
  return normalizeRepairStatus(value, fallback);
}

function normalizePreferredContact(value) {
  return cleanText(value, 20).toLowerCase() === "phone" ? "phone" : "email";
}

function normalizeAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0 || amount > 100000000) {
    throw Object.assign(new Error("견적 금액을 다시 확인해주세요."), { status: 400 });
  }
  return amount;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

const REPAIR_METHODS = new Set(["patch", "woven", "sashiko", "boro"]);

function decodeJson(value, fallback = []) {
  try {
    return JSON.parse(value || "") || fallback;
  } catch {
    return fallback;
  }
}

function normalizeRepairMethods(value) {
  const values = Array.isArray(value) ? value : [];
  return [...new Set(values.map((item) => cleanText(item, 30).toLowerCase()).filter((item) => REPAIR_METHODS.has(item)))];
}

function formatRepairGalleryImage(row) {
  const averageRgb = normalizeImageRgb(row.average_rgb);
  return {
    id: row.id,
    filename: row.original_filename || "",
    contentType: row.content_type || "",
    methods: normalizeRepairMethods(decodeJson(row.methods_json, [])),
    averageRgb,
    sortOrder: Number(row.sort_order || 0),
    status: row.status || "published",
    url: row.r2_key ? buildRepairGalleryUrl(row.r2_key, { averageRgb }) : "",
    createdAt: row.created_at || "",
  };
}

function formatRepairImage(row) {
  return {
    id: row.image_id,
    filename: row.image_original_filename || "",
    contentType: row.image_content_type || "",
    byteSize: Number(row.image_byte_size || 0),
    sortOrder: Number(row.image_sort_order || 0),
    createdAt: row.image_created_at || "",
    streamPath: row.image_id ? `/api/repairs/images/${encodeURIComponent(row.image_id)}` : "",
  };
}

function formatRepairRequest(row) {
  const status = normalizeStatus(row.status);
  const archiveConsentAt = row.archive_consent_at || "";

  return {
    id: row.id,
    customerId: row.customer_id || null,
    requestNumber: row.request_number,
    customerName: row.customer_name,
    email: row.email,
    phone: row.phone,
    contactPreference: normalizePreferredContact(row.preferred_contact || row.contact_preference),
    preferredContact: normalizePreferredContact(row.preferred_contact || row.contact_preference),
    itemType: row.item_type,
    itemBrand: row.item_brand,
    itemMaterial: row.item_material,
    itemColor: row.item_color,
    repairDetails: row.repair_details,
    material: row.item_material,
    issueDescription: row.repair_details,
    desiredResult: row.desired_result || "",
    budgetNote: row.budget_note || "",
    desiredCompletionDate: row.desired_completion_date,
    marketingOptIn: Boolean(row.marketing_opt_in),
    privacyConsentAt: row.privacy_consent_at || row.terms_accepted_at || "",
    archiveConsentAt,
    isArchiveCandidate: status === "closed" && Boolean(archiveConsentAt),
    status,
    statusLabel: REPAIR_STATUS_LABELS[status] || status,
    countryCode: row.country_code || "",
    version: Number(row.version || 1),
    isReadOnly: status === "closed",
    adminNote: row.admin_note,
    customerMessage: row.customer_message,
    quoteAmount: row.quote_amount === null || row.quote_amount === undefined ? null : Number(row.quote_amount),
    finalAmount: row.final_amount === null || row.final_amount === undefined ? null : Number(row.final_amount),
    bankAccount: row.bank_account || "",
    paymentInstructions: row.payment_instructions || "",
    paymentConfirmedAt: row.payment_confirmed_at || "",
    carrier: row.carrier || "",
    trackingNumber: row.tracking_number || "",
    trackingUrl: row.tracking_url || "",
    quotedAt: row.quoted_at || "",
    acceptedAt: row.accepted_at || "",
    completedAt: row.completed_at || "",
    archivedAt: row.archived_at || "",
    closedAt: row.closed_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    ticketId: row.ticket_id || "",
    ticketStatus: row.ticket_status || "",
    unreadCustomerCount: Number(row.unread_customer_count || 0),
    unreadAdminCount: Number(row.unread_admin_count || 0),
    ticketLastMessageAt: row.ticket_last_message_at || "",
    images: [],
    events: [],
    inquiries: [],
    notifications: [],
  };
}

function formatRepairEvent(row) {
  return {
    id: row.id,
    eventType: row.event_type,
    previousStatus: row.previous_status || "",
    nextStatus: row.next_status || "",
    actorType: row.actor_type || "system",
    actorId: row.actor_id || "",
    createdAt: row.created_at || "",
  };
}

function formatRepairNotification(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    eventKey: row.event_key,
    eventType: row.event_type,
    recipient: row.recipient,
    subject: row.subject,
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    status: row.status,
    attemptCount: Number(row.attempt_count || 0),
    availableAt: row.available_at || "",
    providerMessageId: row.provider_message_id || "",
    lastError: row.last_error || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    sentAt: row.sent_at || "",
  };
}

function formatRepairInquiry(row) {
  return {
    id: row.id,
    message: row.message,
    createdAt: row.created_at || "",
  };
}

export function createRepairRequestIdentifiers() {
  return {
    requestId: createId("RPR"),
    requestNumber: createRequestNumber(),
  };
}

export function createRepairImageId() {
  return createId("RPI");
}

export function assertRepairStorage(env) {
  const database = requireDb(env);
  if (!env?.OALUM_R2) {
    throw Object.assign(new Error("Repair 이미지 저장소가 아직 준비되지 않았습니다."), { status: 503 });
  }
  return { database, bucket: env.OALUM_R2 };
}

export async function createRepairRequest(env, input, images = []) {
  const database = requireDb(env);
  const requestId = cleanText(input.requestId, 80);
  const requestNumber = cleanText(input.requestNumber, 80);
  const submissionId = cleanText(input.submissionId, 120) || null;
  const submissionFingerprint = cleanText(input.submissionFingerprint, 128);
  const customerName = cleanText(input.customerName, 120);
  const email = cleanText(input.email, 320);
  const emailNormalized = normalizeEmail(email);
  const privacyConsentAt = cleanText(input.privacyConsentAt || input.termsAcceptedAt, 40) || nowIso();
  const archiveConsentAt = cleanText(input.archiveConsentAt, 40) || null;
  const preferredContact = normalizePreferredContact(input.preferredContact || input.contactPreference);
  const material = cleanText(input.material || input.itemMaterial, 120);
  const issueDescription = cleanText(input.issueDescription || input.repairDetails, 4000);

  if (!requestId || !requestNumber || !customerName || !emailNormalized || !cleanText(input.phone, 60) || !issueDescription) {
    throw Object.assign(new Error("수선 접수 정보를 다시 확인해주세요."), { status: 400 });
  }

  const now = nowIso();
  const eventId = createRepairEventId();
  const requestForNotification = {
    ...input,
    id: requestId,
    requestNumber,
    customerName,
    email: emailNormalized,
    itemType: cleanText(input.itemType, 100),
    status: "received",
    version: 1,
    customerId: cleanText(input.customerId, 80) || null,
    countryCode: cleanText(input.countryCode, 8).toUpperCase(),
  };
  const ticketBundle = await prepareInitialRepairTicketBundle(env, requestForNotification, eventId, now);
  const statements = [
    database
      .prepare(`
        INSERT INTO repair_requests (
          id,
          request_number,
          submission_id,
          submission_fingerprint,
          customer_id,
          country_code,
          customer_name,
          email,
          email_normalized,
          phone,
          contact_preference,
          preferred_contact,
          item_type,
          item_brand,
          item_material,
          item_color,
          repair_details,
          desired_result,
          budget_note,
          desired_completion_date,
          terms_accepted_at,
          privacy_consent_at,
          archive_consent_at,
          marketing_opt_in,
          status,
          admin_note,
          customer_message,
          quote_amount,
          version,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', '', '', NULL, 1, ?, ?)
      `)
      .bind(
        requestId,
        requestNumber,
        submissionId,
        submissionFingerprint,
        cleanText(input.customerId, 80) || null,
        cleanText(input.countryCode, 8).toUpperCase(),
        customerName,
        email,
        emailNormalized,
        cleanText(input.phone, 60),
        preferredContact,
        preferredContact,
        cleanText(input.itemType, 100),
        cleanText(input.itemBrand, 160),
        material,
        cleanText(input.itemColor, 100),
        issueDescription,
        cleanText(input.desiredResult, 2000),
        cleanText(input.budgetNote, 1000),
        cleanText(input.desiredCompletionDate, 10),
        privacyConsentAt,
        privacyConsentAt,
        archiveConsentAt,
        input.marketingOptIn ? 1 : 0,
        now,
        now,
      ),
    ...images.map((image, index) => database
      .prepare(`
        INSERT INTO repair_request_images (
          id,
          request_id,
          r2_key,
          original_filename,
          content_type,
          byte_size,
          sort_order,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        cleanText(image.id, 80),
        requestId,
        cleanText(image.r2Key, 500),
        cleanText(image.filename, 240),
        cleanText(image.contentType, 100),
        Number(image.byteSize || 0),
        Number.isInteger(image.sortOrder) ? image.sortOrder : index,
        now,
      )),
    createRepairEventStatement(database, {
      id: eventId,
      repairRequestId: requestId,
      requestVersion: 1,
      eventType: "repair.application_submitted",
      previousStatus: null,
      nextStatus: "received",
      actorType: input.actorType || "customer",
      actorId: input.actorId || emailNormalized,
      payload: { requestNumber },
      createdAt: now,
    }),
    ...ticketBundle.statements,
  ];

  await database.batch(statements);

  return {
    requestId,
    requestNumber,
    submittedAt: now,
    eventId,
    ticketId: ticketBundle.ticketId,
    notificationIds: ticketBundle.notifications.map((notification) => notification.id),
  };
}

export async function readRepairRequestBySubmissionId(env, submissionId) {
  const normalizedSubmissionId = cleanText(submissionId, 120);
  if (!normalizedSubmissionId) return null;
  const database = requireDb(env);
  const row = await database.prepare(`
    SELECT id, request_number, submission_id, submission_fingerprint, created_at
    FROM repair_requests
    WHERE submission_id = ?
    LIMIT 1
  `).bind(normalizedSubmissionId).first();
  if (!row) return null;
  const notificationResult = await database.prepare(`
    SELECT id, status FROM notification_outbox
    WHERE entity_type = 'repair' AND entity_id = ? AND template_key = 'repair.application_submitted'
    ORDER BY created_at ASC
  `).bind(row.id).all();
  const ticket = await database.prepare(`SELECT id FROM repair_tickets WHERE repair_id = ? LIMIT 1`).bind(row.id).first();
  return {
    requestId: row.id,
    requestNumber: row.request_number,
    submissionId: row.submission_id,
    submissionFingerprint: row.submission_fingerprint || "",
    submittedAt: row.created_at,
    ticketId: ticket?.id || "",
    notificationIds: (notificationResult?.results || []).map((notification) => notification.id),
    notificationStatuses: (notificationResult?.results || []).map((notification) => notification.status),
  };
}

export async function readRepairRequestForAdmin(env, requestId) {
  const normalizedRequestId = cleanText(requestId, 80);
  if (!normalizedRequestId) {
    throw Object.assign(new Error("수선 접수 정보를 다시 확인해주세요."), { status: 400 });
  }
  const database = requireDb(env);
  const row = await database.prepare(`
    SELECT
      r.*,
      t.id AS ticket_id,
      t.status AS ticket_status,
      t.unread_customer_count,
      t.unread_admin_count,
      t.last_message_at AS ticket_last_message_at
    FROM repair_requests r
    LEFT JOIN repair_tickets t ON t.repair_id = r.id
    WHERE r.id = ?
    LIMIT 1
  `).bind(normalizedRequestId).first();
  if (!row) {
    throw Object.assign(new Error("수선 접수를 찾을 수 없습니다."), { status: 404 });
  }
  return formatRepairRequest(row);
}

function formatRepairRequestForCustomer(request) {
  return {
    id: request.id,
    requestNumber: request.requestNumber,
    customerName: request.customerName,
    itemType: request.itemType,
    issueDescription: request.issueDescription,
    desiredResult: request.desiredResult,
    budgetNote: request.budgetNote,
    status: request.status,
    statusLabel: request.statusLabel,
    isReadOnly: request.isReadOnly,
    ticketId: request.ticketId,
    ticketStatus: request.ticketStatus,
    unreadCustomerCount: request.unreadCustomerCount,
    ticketLastMessageAt: request.ticketLastMessageAt,
    customerMessage: request.customerMessage,
    finalAmount: request.finalAmount,
    bankAccount: ["payment_pending", "shipping", "closed"].includes(request.status) ? request.bankAccount : "",
    paymentInstructions: ["payment_pending", "shipping", "closed"].includes(request.status) ? request.paymentInstructions : "",
    paymentConfirmedAt: request.paymentConfirmedAt,
    carrier: request.carrier,
    trackingNumber: request.trackingNumber,
    trackingUrl: request.trackingUrl,
    closedAt: request.closedAt,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    inquiries: request.inquiries.map((inquiry) => ({ ...inquiry })),
    images: request.images.map((image) => ({
      id: image.id,
      filename: image.filename,
      contentType: image.contentType,
      byteSize: image.byteSize,
      createdAt: image.createdAt,
      streamPath: `/api/repairs/customer-images/${encodeURIComponent(image.id)}`,
    })),
  };
}

async function readCustomerRepairRows(database, whereClause, bindings, limit = 20) {
  const result = await database.prepare(`
    SELECT
      r.*,
      t.id AS ticket_id,
      t.status AS ticket_status,
      t.unread_customer_count,
      t.unread_admin_count,
      t.last_message_at AS ticket_last_message_at,
      i.id AS image_id,
      i.original_filename AS image_original_filename,
      i.content_type AS image_content_type,
      i.byte_size AS image_byte_size,
      i.sort_order AS image_sort_order,
      i.created_at AS image_created_at
    FROM repair_requests r
    LEFT JOIN repair_tickets t ON t.repair_id = r.id
    LEFT JOIN repair_request_images i ON i.request_id = r.id
    WHERE ${whereClause}
    ORDER BY r.created_at DESC, i.sort_order ASC, i.created_at ASC
    LIMIT ?
  `).bind(...bindings, limit * 4).all();
  const byId = new Map();
  for (const row of result?.results || []) {
    if (!byId.has(row.id) && byId.size < limit) byId.set(row.id, formatRepairRequest(row));
    if (row.image_id && byId.has(row.id)) byId.get(row.id).images.push(formatRepairImage(row));
  }
  for (const request of byId.values()) {
    const inquiries = await database.prepare(`
      SELECT * FROM repair_customer_inquiries
      WHERE repair_request_id = ?
      ORDER BY created_at DESC
    `).bind(request.id).all();
    request.inquiries = (inquiries?.results || []).map(formatRepairInquiry);
  }
  return Array.from(byId.values()).map(formatRepairRequestForCustomer);
}

export async function readRepairRequestsForEmail(env, email, limit = 20) {
  const database = requireDb(env);
  const emailNormalized = normalizeEmail(email);
  if (!emailNormalized) return [];
  return readCustomerRepairRows(database, "r.email_normalized = ?", [emailNormalized], limit);
}

export async function readRepairRequestForEmail(env, requestId, email) {
  const database = requireDb(env);
  const requests = await readCustomerRepairRows(
    database,
    "r.id = ? AND r.email_normalized = ?",
    [cleanText(requestId, 80), normalizeEmail(email)],
    1,
  );
  if (!requests.length) {
    throw Object.assign(new Error("수선 접수를 찾을 수 없습니다."), { status: 404 });
  }
  return requests[0];
}

export async function lookupGuestRepairRequest(env, { reference, email }) {
  const database = requireDb(env);
  const requestNumber = cleanText(reference, 80).toUpperCase();
  const emailNormalized = normalizeEmail(email);
  const requests = await readCustomerRepairRows(
    database,
    "upper(r.request_number) = ? AND r.email_normalized = ?",
    [requestNumber, emailNormalized],
    1,
  );
  if (!requests.length) {
    throw Object.assign(new Error("입력한 정보와 일치하는 신청 내역을 찾을 수 없습니다."), { status: 404 });
  }
  return requests[0];
}

export async function readRepairRequestForCustomer(env, requestId) {
  const database = requireDb(env);
  const requests = await readCustomerRepairRows(database, "r.id = ?", [cleanText(requestId, 80)], 1);
  if (!requests.length) {
    throw Object.assign(new Error("수선 접수를 찾을 수 없습니다."), { status: 404 });
  }
  return requests[0];
}

export async function readRepairImageForCustomer(env, imageId) {
  const database = requireDb(env);
  const row = await database.prepare(`
    SELECT
      i.id, i.request_id, i.r2_key, i.original_filename, i.content_type,
      r.request_number, r.email_normalized
    FROM repair_request_images i
    INNER JOIN repair_requests r ON r.id = i.request_id
    WHERE i.id = ?
    LIMIT 1
  `).bind(cleanText(imageId, 80)).first();
  if (!row) {
    throw Object.assign(new Error("이미지를 찾을 수 없습니다."), { status: 404 });
  }
  return {
    id: row.id,
    requestId: row.request_id,
    requestNumber: row.request_number,
    emailNormalized: row.email_normalized,
    r2Key: row.r2_key,
    filename: row.original_filename,
    contentType: row.content_type,
  };
}

export async function createRepairCustomerInquiry(env, input, actor = {}) {
  const database = requireDb(env);
  const requestId = cleanText(input.requestId, 80);
  const inquiryId = cleanText(input.inquiryId, 80);
  const message = cleanText(input.message, 2000);
  if (!requestId || !inquiryId || !message) {
    throw Object.assign(new Error("문의 내용을 다시 확인해주세요."), { status: 400 });
  }
  const existingInquiry = await database.prepare(`
    SELECT id, created_at FROM repair_customer_inquiries WHERE id = ? LIMIT 1
  `).bind(inquiryId).first();
  if (existingInquiry) {
    return {
      duplicate: true,
      inquiryId: existingInquiry.id,
      createdAt: existingInquiry.created_at,
      notificationIds: [],
    };
  }

  const row = await database.prepare(`SELECT * FROM repair_requests WHERE id = ? LIMIT 1`).bind(requestId).first();
  if (!row) {
    throw Object.assign(new Error("수선 접수를 찾을 수 없습니다."), { status: 404 });
  }
  if (normalizeStatus(row.status) === "closed") {
    throw Object.assign(new Error("배송 완료된 수선 내역에는 새 문의를 남길 수 없습니다."), { status: 409 });
  }
  const rateBucket = String(Math.floor(Date.now() / (5 * 60 * 1000)));
  const recent = await database.prepare(`
    SELECT id
    FROM repair_customer_inquiries
    WHERE repair_request_id = ? AND rate_bucket = ?
    LIMIT 1
  `).bind(requestId, rateBucket).first();
  if (recent) {
    throw Object.assign(new Error("문의는 5분에 한 번 등록할 수 있습니다."), { status: 429 });
  }

  const eventId = createRepairEventId();
  const createdAt = nowIso();
  const request = formatRepairRequest(row);
  const notifications = await prepareRepairNotifications(
    env,
    request,
    eventId,
    "repair.customer_inquiry",
    {
      inquiryId,
      inquiryMessage: message,
      inquiryCreatedAt: createdAt,
    },
  );
  const inquiryStatement = database.prepare(`
    INSERT INTO repair_customer_inquiries (id, repair_request_id, rate_bucket, message, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(inquiryId, requestId, rateBucket, message, createdAt);
  const eventStatement = createRepairEventStatement(database, {
    id: eventId,
    repairRequestId: requestId,
    requestVersion: null,
    eventType: "repair.customer_inquiry",
    actorType: actor.type || "customer",
    actorId: actor.id || "",
    payload: { inquiryId },
    createdAt,
  });

  try {
    await database.batch([
      inquiryStatement,
      eventStatement,
      ...notifications.map((notification) => createRepairOutboxStatement(database, notification)),
    ]);
  } catch (error) {
    const duplicate = await database.prepare(`
      SELECT id, created_at FROM repair_customer_inquiries WHERE id = ? LIMIT 1
    `).bind(inquiryId).first();
    if (duplicate) {
      return {
        duplicate: true,
        inquiryId: duplicate.id,
        createdAt: duplicate.created_at,
        notificationIds: [],
      };
    }
    const rateLimited = await database.prepare(`
      SELECT id FROM repair_customer_inquiries
      WHERE repair_request_id = ? AND rate_bucket = ?
      LIMIT 1
    `).bind(requestId, rateBucket).first();
    if (rateLimited) {
      throw Object.assign(new Error("문의는 5분에 한 번 등록할 수 있습니다."), { status: 429 });
    }
    throw error;
  }

  return {
    duplicate: false,
    inquiryId,
    createdAt,
    notificationIds: notifications.map((notification) => notification.id),
  };
}

export async function readRepairAdminSnapshot(env) {
  const database = requireDb(env);
  const result = await database
    .prepare(`
      SELECT
        r.*,
        t.id AS ticket_id,
        t.status AS ticket_status,
        t.unread_customer_count,
        t.unread_admin_count,
        t.last_message_at AS ticket_last_message_at,
        i.id AS image_id,
        i.original_filename AS image_original_filename,
        i.content_type AS image_content_type,
        i.byte_size AS image_byte_size,
        i.sort_order AS image_sort_order,
        i.created_at AS image_created_at
      FROM repair_requests r
      LEFT JOIN repair_tickets t ON t.repair_id = r.id
      LEFT JOIN repair_request_images i ON i.request_id = r.id
      ORDER BY r.created_at DESC, i.sort_order ASC, i.created_at ASC
    `)
    .all();

  const byId = new Map();
  for (const row of result?.results || []) {
    if (!byId.has(row.id)) {
      byId.set(row.id, formatRepairRequest(row));
    }
    if (row.image_id) {
      byId.get(row.id).images.push(formatRepairImage(row));
    }
  }

  const [eventResult, notificationResult, inquiryResult] = await Promise.all([
    database.prepare(`
      SELECT * FROM repair_events ORDER BY created_at DESC
    `).all(),
    database.prepare(`
      SELECT * FROM repair_notification_outbox ORDER BY created_at DESC
    `).all(),
    database.prepare(`
      SELECT * FROM repair_customer_inquiries ORDER BY created_at DESC
    `).all(),
  ]);
  for (const row of eventResult?.results || []) {
    byId.get(row.repair_request_id)?.events.push(formatRepairEvent(row));
  }
  for (const row of notificationResult?.results || []) {
    byId.get(row.repair_request_id)?.notifications.push(formatRepairNotification(row));
  }
  for (const row of inquiryResult?.results || []) {
    byId.get(row.repair_request_id)?.inquiries.push(formatRepairInquiry(row));
  }

  const gallery = await readRepairGallery(env, { includeDrafts: true });
  return { requests: Array.from(byId.values()), gallery };
}

export async function readRepairGallery(env, { includeDrafts = false } = {}) {
  const database = requireDb(env);
  const result = await database.prepare(`
    SELECT * FROM repair_gallery_images
    ${includeDrafts ? "" : "WHERE status = 'published'"}
    ORDER BY sort_order ASC, created_at DESC
  `).all();
  return (result?.results || []).map(formatRepairGalleryImage);
}

export async function createRepairGalleryImage(env, input) {
  const database = requireDb(env);
  const now = nowIso();
  const id = cleanText(input.id, 80) || createId("RPG");
  await database.prepare(`
    INSERT INTO repair_gallery_images (
      id, r2_key, original_filename, content_type, methods_json, average_rgb,
      sort_order, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)
  `).bind(
    id,
    cleanText(input.r2Key, 500),
    cleanText(input.filename, 240),
    cleanText(input.contentType, 100),
    JSON.stringify(normalizeRepairMethods(input.methods)),
    normalizeImageRgb(input.averageRgb),
    Math.max(0, Number(input.sortOrder) || 0),
    now,
    now,
  ).run();
  return readRepairGallery(env, { includeDrafts: true });
}

export async function deleteRepairGalleryImage(env, id) {
  const database = requireDb(env);
  const row = await database.prepare(`SELECT * FROM repair_gallery_images WHERE id = ? LIMIT 1`).bind(cleanText(id, 80)).first();
  if (!row) throw Object.assign(new Error("수선 작업 이미지를 찾을 수 없습니다."), { status: 404 });
  await database.prepare(`DELETE FROM repair_gallery_images WHERE id = ?`).bind(row.id).run();
  return { r2Key: row.r2_key, gallery: await readRepairGallery(env, { includeDrafts: true }) };
}

export async function updateRepairGalleryImageStatus(env, id, published) {
  const database = requireDb(env);
  const imageId = cleanText(id, 80);
  const now = nowIso();
  const result = await database.prepare(`
    UPDATE repair_gallery_images
    SET status = ?, updated_at = ?
    WHERE id = ?
  `).bind(published ? "published" : "draft", now, imageId).run();
  if (Number(result?.meta?.changes ?? result?.changes ?? 0) !== 1) {
    throw Object.assign(new Error("수선 작업 사진을 찾을 수 없습니다."), { status: 404 });
  }
  return readRepairGallery(env, { includeDrafts: true });
}

export async function updateRepairRequest(env, input) {
  const database = requireDb(env);
  const requestId = cleanText(input.id, 80);
  if (!requestId) {
    throw Object.assign(new Error("수선 접수 정보를 다시 확인해주세요."), { status: 400 });
  }

  const existing = await database.prepare(`SELECT * FROM repair_requests WHERE id = ? LIMIT 1`).bind(requestId).first();
  if (!existing) {
    throw Object.assign(new Error("수선 접수를 찾을 수 없습니다."), { status: 404 });
  }

  const currentStatus = normalizeStatus(existing.status);
  if (currentStatus === "closed") {
    throw Object.assign(new Error("배송 완료된 수선 내역은 읽기 전용입니다."), { status: 409 });
  }

  const expectedVersion = Number(input.expectedVersion);
  const currentVersion = Number(existing.version || 1);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw Object.assign(new Error("수선 내역 버전을 다시 확인해주세요."), { status: 400 });
  }
  if (expectedVersion !== currentVersion) {
    throw Object.assign(new Error("다른 관리자 화면에서 먼저 수정했습니다. 최신 내용을 다시 불러와주세요."), { status: 409 });
  }

  const now = nowIso();
  const status = hasOwn(input, "status") ? normalizeStatus(input.status, currentStatus) : currentStatus;
  const adminNote = hasOwn(input, "adminNote") ? cleanText(input.adminNote, 4000) : existing.admin_note;
  const customerMessage = hasOwn(input, "customerMessage") ? cleanText(input.customerMessage, 2000) : existing.customer_message;
  const quoteAmount = hasOwn(input, "quoteAmount") ? normalizeAmount(input.quoteAmount) : existing.quote_amount;
  const finalAmount = hasOwn(input, "finalAmount") ? normalizeAmount(input.finalAmount) : existing.final_amount;
  const bankAccount = hasOwn(input, "bankAccount") ? cleanText(input.bankAccount, 500) : existing.bank_account;
  const paymentInstructions = hasOwn(input, "paymentInstructions") ? cleanText(input.paymentInstructions, 2000) : existing.payment_instructions;
  const paymentConfirmedAt = hasOwn(input, "paymentConfirmedAt")
    ? cleanText(input.paymentConfirmedAt, 40) || null
    : existing.payment_confirmed_at;
  const carrier = hasOwn(input, "carrier") ? cleanText(input.carrier, 120) : existing.carrier;
  const trackingNumber = hasOwn(input, "trackingNumber") ? cleanText(input.trackingNumber, 160) : existing.tracking_number;
  const trackingUrl = hasOwn(input, "trackingUrl") ? cleanText(input.trackingUrl, 1000) : existing.tracking_url;
  const countryCode = hasOwn(input, "countryCode") ? cleanText(input.countryCode, 8).toUpperCase() : existing.country_code;
  if (trackingUrl) {
    let parsedUrl;
    try {
      parsedUrl = new URL(trackingUrl);
    } catch {
      throw Object.assign(new Error("배송 조회 URL을 다시 확인해주세요."), { status: 400 });
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw Object.assign(new Error("배송 조회 URL을 다시 확인해주세요."), { status: 400 });
    }
  }

  assertRepairStatusRequirements(status, {
    finalAmount,
    bankAccount,
    paymentInstructions,
    paymentConfirmedAt,
    carrier,
    trackingNumber,
  });

  const statusChanged = status !== currentStatus;
  const changed = statusChanged
    || adminNote !== existing.admin_note
    || customerMessage !== existing.customer_message
    || quoteAmount !== existing.quote_amount
    || finalAmount !== existing.final_amount
    || bankAccount !== existing.bank_account
    || paymentInstructions !== existing.payment_instructions
    || paymentConfirmedAt !== existing.payment_confirmed_at
    || carrier !== existing.carrier
    || trackingNumber !== existing.tracking_number
    || trackingUrl !== existing.tracking_url
    || countryCode !== existing.country_code;
  if (!changed) {
    return {
      ...(await readRepairAdminSnapshot(env)),
      operation: {
        changed: false,
        statusChanged: false,
        notificationStatus: "not_created",
        notificationIds: [],
      },
    };
  }

  const nextVersion = currentVersion + 1;
  const eventId = createRepairEventId();
  const eventType = statusChanged
    ? "repair.status_changed"
    : "repair.updated";
  const closedAt = status === "closed" ? now : existing.closed_at;
  const acceptedAt = status === "in_progress" ? existing.accepted_at || now : existing.accepted_at;
  const completedAt = status === "payment_pending" ? existing.completed_at || now : existing.completed_at;
  const archivedAt = status === "closed" ? existing.archived_at || now : existing.archived_at;
  const updatedRequest = {
    ...formatRepairRequest(existing),
    status,
    version: nextVersion,
    adminNote,
    customerMessage,
    quoteAmount,
    finalAmount,
    bankAccount,
    paymentInstructions,
    paymentConfirmedAt: paymentConfirmedAt || "",
    carrier,
    trackingNumber,
    trackingUrl,
    countryCode,
    closedAt: closedAt || "",
  };
  const ticketBundle = statusChanged
    ? await prepareRepairStatusTicketBundle(env, updatedRequest, eventId, currentStatus, status, now)
    : null;

  const updateStatement = database.prepare(`
    UPDATE repair_requests
    SET status = ?, admin_note = ?, customer_message = ?, quote_amount = ?, final_amount = ?,
        bank_account = ?, payment_instructions = ?, payment_confirmed_at = ?, carrier = ?,
        tracking_number = ?, tracking_url = ?, country_code = ?, accepted_at = ?, completed_at = ?,
        archived_at = ?, closed_at = ?, version = ?, updated_at = ?
    WHERE id = ? AND version = ?
  `).bind(
    status,
    adminNote,
    customerMessage,
    quoteAmount,
    finalAmount,
    bankAccount,
    paymentInstructions,
    paymentConfirmedAt,
    carrier,
    trackingNumber,
    trackingUrl,
    countryCode,
    acceptedAt,
    completedAt,
    archivedAt,
    closedAt,
    nextVersion,
    now,
    requestId,
    currentVersion,
  );
  const eventStatement = createRepairEventStatement(database, {
    id: eventId,
    repairRequestId: requestId,
    requestVersion: nextVersion,
    eventType,
    previousStatus: currentStatus,
    nextStatus: status,
    actorType: input.actorType || "admin",
    actorId: input.actorId || "",
    payload: { changedFields: Object.keys(input).filter((key) => !["id", "expectedVersion", "actorType", "actorId"].includes(key)) },
    createdAt: now,
  });

  try {
    await database.batch([
      updateStatement,
      eventStatement,
      ...(ticketBundle?.statements || []),
    ]);
  } catch (error) {
    const latest = await database.prepare(`SELECT version FROM repair_requests WHERE id = ? LIMIT 1`).bind(requestId).first();
    if (Number(latest?.version || 0) !== currentVersion) {
      throw Object.assign(new Error("다른 관리자 화면에서 먼저 수정했습니다. 최신 내용을 다시 불러와주세요."), { status: 409 });
    }
    throw error;
  }

  return {
    ...(await readRepairAdminSnapshot(env)),
    operation: {
      changed: true,
      statusChanged,
      eventId,
      notificationStatus: ticketBundle?.notifications.length
        ? (ticketBundle.notifications.some((notification) => notification.status === "failed") ? "failed" : "pending")
        : "not_created",
      notificationIds: (ticketBundle?.notifications || []).map((notification) => notification.id),
      ticketMessageId: ticketBundle?.messageId || "",
    },
  };
}

export async function readRepairImageForAdmin(env, imageId) {
  const database = requireDb(env);
  const normalizedImageId = cleanText(imageId, 80);
  if (!normalizedImageId) {
    throw Object.assign(new Error("이미지를 찾을 수 없습니다."), { status: 404 });
  }

  const image = await database
    .prepare(`
      SELECT
        i.id,
        i.r2_key,
        i.original_filename,
        i.content_type,
        r.request_number
      FROM repair_request_images i
      INNER JOIN repair_requests r ON r.id = i.request_id
      WHERE i.id = ?
      LIMIT 1
    `)
    .bind(normalizedImageId)
    .first();

  if (!image) {
    throw Object.assign(new Error("이미지를 찾을 수 없습니다."), { status: 404 });
  }

  return {
    r2Key: image.r2_key,
    filename: image.original_filename,
    contentType: image.content_type,
    requestNumber: image.request_number,
  };
}