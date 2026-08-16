const REPAIR_STATUSES = new Set([
  "received",
  "reviewing",
  "quoted",
  "approved",
  "in_progress",
  "completed",
  "rejected",
  "cancelled",
]);

const LEGACY_REPAIR_STATUS_ALIASES = {
  submitted: "received",
  accepted: "approved",
  ready: "completed",
  declined: "rejected",
  archived: "completed",
};

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
  const status = cleanText(value, 40).toLowerCase();
  const normalized = LEGACY_REPAIR_STATUS_ALIASES[status] || status;
  return REPAIR_STATUSES.has(normalized) ? normalized : fallback;
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
  return {
    id: row.id,
    filename: row.original_filename || "",
    contentType: row.content_type || "",
    methods: normalizeRepairMethods(decodeJson(row.methods_json, [])),
    sortOrder: Number(row.sort_order || 0),
    status: row.status || "published",
    url: row.r2_key ? `/api/r2?key=${encodeURIComponent(row.r2_key)}` : "",
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
    isArchiveCandidate: status === "completed" && Boolean(archiveConsentAt),
    status,
    adminNote: row.admin_note,
    customerMessage: row.customer_message,
    quoteAmount: row.quote_amount === null || row.quote_amount === undefined ? null : Number(row.quote_amount),
    finalAmount: row.final_amount === null || row.final_amount === undefined ? null : Number(row.final_amount),
    quotedAt: row.quoted_at || "",
    acceptedAt: row.accepted_at || "",
    completedAt: row.completed_at || "",
    archivedAt: row.archived_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    images: [],
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
  const statements = [
    database
      .prepare(`
        INSERT INTO repair_requests (
          id,
          request_number,
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
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', '', '', NULL, ?, ?)
      `)
      .bind(
        requestId,
        requestNumber,
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
  ];

  await database.batch(statements);

  return {
    requestNumber,
    submittedAt: now,
  };
}

export async function readRepairAdminSnapshot(env) {
  const database = requireDb(env);
  const result = await database
    .prepare(`
      SELECT
        r.*,
        i.id AS image_id,
        i.original_filename AS image_original_filename,
        i.content_type AS image_content_type,
        i.byte_size AS image_byte_size,
        i.sort_order AS image_sort_order,
        i.created_at AS image_created_at
      FROM repair_requests r
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
      id, r2_key, original_filename, content_type, methods_json,
      sort_order, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?)
  `).bind(
    id,
    cleanText(input.r2Key, 500),
    cleanText(input.filename, 240),
    cleanText(input.contentType, 100),
    JSON.stringify(normalizeRepairMethods(input.methods)),
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

  const now = nowIso();
  const status = hasOwn(input, "status") ? normalizeStatus(input.status, normalizeStatus(existing.status)) : normalizeStatus(existing.status);
  const quoteAmount = hasOwn(input, "quoteAmount") ? normalizeAmount(input.quoteAmount) : existing.quote_amount;
  const finalAmount = hasOwn(input, "finalAmount") ? normalizeAmount(input.finalAmount) : existing.final_amount;
  const quotedAt = status === "quoted" && quoteAmount !== null
    ? existing.quoted_at || now
    : existing.quoted_at;
  const acceptedAt = status === "approved" ? existing.accepted_at || now : existing.accepted_at;
  const completedAt = status === "completed" ? existing.completed_at || now : existing.completed_at;
  const archivedAt = existing.archived_at;

  await database
    .prepare(`
      UPDATE repair_requests
      SET status = ?, admin_note = ?, customer_message = ?, quote_amount = ?, final_amount = ?, quoted_at = ?, accepted_at = ?, completed_at = ?, archived_at = ?, updated_at = ?
      WHERE id = ?
    `)
    .bind(
      status,
      hasOwn(input, "adminNote") ? cleanText(input.adminNote, 4000) : existing.admin_note,
      hasOwn(input, "customerMessage") ? cleanText(input.customerMessage, 2000) : existing.customer_message,
      quoteAmount,
      finalAmount,
      quotedAt,
      acceptedAt,
      completedAt,
      archivedAt,
      now,
      requestId,
    )
    .run();

  return readRepairAdminSnapshot(env);
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