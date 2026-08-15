import {
  getWorkshopBookingConfig,
  normalizeWorkshop,
  WORKSHOP_TYPES,
} from "../../runtime/storefront/scripts/utils/workshops.js";
import {
  archiveWorkshopContent,
  readPublicWorkshopBySlug,
  readPublicWorkshopCatalog,
  readStoredWorkshopCatalog,
  readStoredWorkshopContentBySlug,
  readWorkshopAdminCatalog,
  upsertWorkshopContent as upsertWorkshopContentRecord,
} from "./workshop-content.js";
import { cancelTossPayment, confirmTossPayment, getTossConfig } from "./toss.js";

const WORKSHOP_TIME_ZONE = "Asia/Seoul";
const GLOBAL_WORKSHOP_BLOCK_SLUG = "*";
const WORKSHOP_TYPE_VALUES = new Set(Object.values(WORKSHOP_TYPES));
const D1_IN_QUERY_BATCH_SIZE = 80;
const RESERVATION_STATUSES = new Set([
  "waiting_for_group",
  "waiting_for_payment",
  "confirmed",
  "cancelled",
  "expired",
]);

function getDb(env) {
  return env?.OALUM_DB || null;
}

function requireDb(env) {
  const database = getDb(env);
  if (!database) {
    throw Object.assign(new Error("D1 binding is required for workshop reservations."), {
      status: 503,
    });
  }

  return database;
}

function nowIso() {
  return new Date().toISOString();
}

function getTodayIsoInTimeZone(timeZone = WORKSHOP_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = parts.reduce((accumulator, part) => {
    if (part.type === "year" || part.type === "month" || part.type === "day") {
      accumulator[part.type] = part.value;
    }
    return accumulator;
  }, {});

  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanText(value, maxLength = 200) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeDateText(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return "";
  }

  return raw;
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`.toUpperCase();
}

function encodeJson(value, fallback = {}) {
  return JSON.stringify(value == null ? fallback : value);
}

function decodeJson(value, fallback = null) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeWorkshopType(value, fallback = WORKSHOP_TYPES.ONE_DAY_FIXED) {
  const type = String(value || "").trim();
  const legacyTypes = {
    daily: WORKSHOP_TYPES.DAILY,
    event: WORKSHOP_TYPES.EVENT,
    multiSession: WORKSHOP_TYPES.MULTI_SESSION,
    one_day_open: WORKSHOP_TYPES.DAILY,
    one_day_fixed: WORKSHOP_TYPES.EVENT,
    multi_session: WORKSHOP_TYPES.MULTI_SESSION,
  };
  return legacyTypes[type] || (WORKSHOP_TYPE_VALUES.has(type) ? type : fallback);
}

function normalizeJoinPolicy(value) {
  const policy = String(value || "").trim().toLowerCase();
  return policy === "open" ? "open" : "private";
}

function normalizePriceTiers(value) {
  const source = value && typeof value === "object" ? value : {};
  const tiers = {};

  for (const count of [1, 2, 3, 4]) {
    const amount = Number(source[count]);
    if (Number.isFinite(amount) && amount >= 0) {
      tiers[count] = Math.round(amount);
    }
  }

  return tiers;
}

function getReservationStatusLabel(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "waiting_for_group") return "모집 대기";
  if (normalized === "waiting_for_payment") return "결제 대기";
  if (normalized === "confirmed") return "확정";
  if (normalized === "cancelled") return "취소";
  if (normalized === "expired") return "만료";
  return normalized || "확정";
}

function addHoursIso(hours) {
  const date = new Date();
  date.setHours(date.getHours() + Math.max(1, Number(hours) || 1));
  return date.toISOString();
}

function formatReservation(row) {
  if (!row) return null;

  return {
    reservationId: row.id,
    userId: row.user_id || null,
    email: row.email,
    fullName: row.full_name || "",
    phone: row.phone || "",
    workshopSlug: row.workshop_slug,
    workshopTitle: row.workshop_title,
    workshopCategory: row.workshop_category || "",
    workshopLocation: row.workshop_location || "",
    slotKey: row.slot_key,
    slotLabel: row.slot_label || "",
    slotDate: row.slot_date,
    slotStartTime: row.slot_start_time,
    slotEndTime: row.slot_end_time || "",
    attendeeCount: Number(row.attendee_count) || 1,
    status: row.status || "confirmed",
    statusLabel: getReservationStatusLabel(row.status),
    note: row.note || "",
    groupId: row.group_id || null,
    bookingType: normalizeWorkshopType(row.booking_type),
    joinPolicy: normalizeJoinPolicy(row.join_policy || row.group_mode),
    paymentStatus: row.payment_status || "pending",
    requestedAmount: Math.max(0, Number(row.requested_amount ?? row.amount_due) || 0),
    finalAmount: row.final_amount == null ? null : Math.max(0, Number(row.final_amount) || 0),
    pricePending: Number(row.price_pending) === 1,
    amountDue: Math.max(0, Number(row.amount_due) || 0),
    amountPaid: Math.max(0, Number(row.amount_paid) || 0),
    paymentOrderId: row.payment_order_id || null,
    checkoutId: row.checkout_token || null,
    priceSnapshot: decodeJson(row.price_snapshot, {}),
    workshopSnapshot: decodeJson(row.workshop_snapshot, {}),
    slotSnapshot: decodeJson(row.slot_snapshot, {}),
    paidAt: row.paid_at || null,
    cancelledAt: row.cancelled_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readSlotReservationCounts(database, slotKeys = []) {
  if (!Array.isArray(slotKeys) || slotKeys.length === 0) {
    return new Map();
  }

  const counts = new Map();
  for (let offset = 0; offset < slotKeys.length; offset += D1_IN_QUERY_BATCH_SIZE) {
    const batch = slotKeys.slice(offset, offset + D1_IN_QUERY_BATCH_SIZE);
    const placeholders = batch.map(() => "?").join(", ");
    const result = await database
      .prepare(`
        SELECT slot_key, COALESCE(SUM(attendee_count), 0) AS reserved_count
        FROM workshop_reservations
        WHERE status IN ('waiting_for_group', 'waiting_for_payment', 'confirmed')
          AND slot_key IN (${placeholders})
        GROUP BY slot_key
      `)
      .bind(...batch)
      .all();

    for (const row of result?.results || []) {
      counts.set(String(row.slot_key || "").trim(), Number(row.reserved_count) || 0);
    }
  }

  return counts;
}

async function readDailyPrivateReservationDates(database, workshopSlug, dates = []) {
  if (!database || !workshopSlug || !Array.isArray(dates) || dates.length === 0) {
    return new Set();
  }

  const normalizedDates = Array.from(new Set(dates.map(normalizeDateText).filter(Boolean)));
  const privateDates = new Set();

  for (let offset = 0; offset < normalizedDates.length; offset += D1_IN_QUERY_BATCH_SIZE) {
    const batch = normalizedDates.slice(offset, offset + D1_IN_QUERY_BATCH_SIZE);
    const placeholders = batch.map(() => "?").join(", ");
    const result = await database
      .prepare(`
        SELECT DISTINCT slot_date
        FROM workshop_reservations
        WHERE workshop_slug = ?
          AND join_policy = 'private'
          AND status IN ('waiting_for_payment', 'confirmed')
          AND slot_date IN (${placeholders})
      `)
      .bind(workshopSlug, ...batch)
      .all();

    for (const row of result?.results || []) {
      const date = normalizeDateText(row.slot_date);
      if (date) privateDates.add(date);
    }
  }

  return privateDates;
}

function mergeWorkshopBookingConfig(workshop, row) {
  if (!row) return normalizeWorkshop(workshop);

  const base = workshop?.bookingConfig && typeof workshop.bookingConfig === "object"
    ? workshop.bookingConfig
    : {};
  const priceTiers = normalizePriceTiers(decodeJson(row.price_tiers_json, {}));

  return normalizeWorkshop({
    ...workshop,
    bookingConfig: {
      ...base,
      type: normalizeWorkshopType(row.workshop_type, base.type),
      priceTiers: Object.keys(priceTiers).length > 0 ? priceTiers : base.priceTiers || base.attendeePrices || {},
      fixedPrice: Math.max(0, Number(row.fixed_price) || 0),
      minParticipants: Math.max(1, Number(row.min_participants) || 1),
      maxParticipants: Math.max(1, Number(row.max_participants) || 4),
      paymentDeadlineHours: Math.max(1, Number(row.payment_deadline_hours) || 48),
    },
  });
}

async function readWorkshopBookingConfig(database, workshop) {
  if (!database || !workshop?.slug) {
    return normalizeWorkshop(workshop);
  }

  try {
    const row = await database
      .prepare(`SELECT * FROM workshop_booking_configs WHERE workshop_slug = ? LIMIT 1`)
      .bind(workshop.slug)
      .first();
    return mergeWorkshopBookingConfig(workshop, row);
  } catch (error) {
    if (String(error?.message || "").includes("no such table")) {
      return normalizeWorkshop(workshop);
    }
    throw error;
  }
}

async function readWorkshopDateBlockMap(database, workshopSlug, dates = []) {
  if (!database || !workshopSlug || !Array.isArray(dates) || dates.length === 0) {
    return new Map();
  }

  const normalizedDates = Array.from(new Set(dates.map((value) => normalizeDateText(value)).filter(Boolean)));
  if (normalizedDates.length === 0) {
    return new Map();
  }

  const map = new Map();
  for (let offset = 0; offset < normalizedDates.length; offset += D1_IN_QUERY_BATCH_SIZE) {
    const batch = normalizedDates.slice(offset, offset + D1_IN_QUERY_BATCH_SIZE);
    const placeholders = batch.map(() => "?").join(", ");
    const result = await database
      .prepare(`
        SELECT *
        FROM workshop_schedule_blocks
        WHERE workshop_slug IN (?, ?)
          AND slot_date IN (${placeholders})
        ORDER BY CASE WHEN workshop_slug = ? THEN 0 ELSE 1 END
      `)
      .bind(GLOBAL_WORKSHOP_BLOCK_SLUG, cleanText(workshopSlug, 120), ...batch, GLOBAL_WORKSHOP_BLOCK_SLUG)
      .all();

    for (const row of result?.results || []) {
      const key = String(row.slot_date || "").trim();
      if (!key || map.has(key)) continue;
      map.set(key, {
        id: row.id,
        workshopSlug: row.workshop_slug,
        workshopTitle: row.workshop_title || "",
        slotDate: row.slot_date,
        reason: row.reason || "예약 불가 일정입니다.",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isGlobal: String(row.workshop_slug || "").trim() === GLOBAL_WORKSHOP_BLOCK_SLUG,
      });
    }
  }

  return map;
}

function formatWorkshopDateBlock(row) {
  if (!row) return null;

  return {
    id: row.id,
    workshopSlug: row.workshop_slug,
    workshopTitle: row.workshop_title || "",
    isGlobal: String(row.workshop_slug || "").trim() === GLOBAL_WORKSHOP_BLOCK_SLUG,
    slotDate: row.slot_date,
    reason: row.reason || "예약 불가 일정입니다.",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readWorkshopDateBlocks(database, { limit = 60 } = {}) {
  if (!database) {
    return [];
  }

  const result = await database
    .prepare(`
      SELECT *
      FROM workshop_schedule_blocks
      ORDER BY slot_date ASC, workshop_title ASC, created_at DESC
      LIMIT ?
    `)
    .bind(Math.max(1, Math.min(Number(limit) || 60, 200)))
    .all();

  return (result?.results || []).map(formatWorkshopDateBlock).filter(Boolean);
}

async function readScheduledWorkshopDateBlockMap(database, dates = []) {
  if (!database || !Array.isArray(dates) || dates.length === 0) {
    return new Map();
  }

  const dateSet = new Set(dates.map((value) => normalizeDateText(value)).filter(Boolean));
  if (!dateSet.size) return new Map();

  const result = await database
    .prepare(`SELECT title, schedule_slots_json, booking_config_json FROM workshops WHERE status = 'published'`)
    .all();
  const blocks = new Map();

  for (const row of (result?.results || [])) {
    const config = decodeJson(row.booking_config_json, {});
    if (String(config?.mode || "scheduled") !== "scheduled") continue;

    const slots = decodeJson(row.schedule_slots_json, []);
    for (const slot of Array.isArray(slots) ? slots : []) {
      const date = normalizeDateText(slot?.date);
      const isBlocked = slot?.isBlocked === true || String(slot?.status || "").trim().toLowerCase() === "blocked";
      if (!date || isBlocked || !dateSet.has(date) || blocks.has(date)) continue;
      blocks.set(date, `${cleanText(row.title, 160) || "다회성 워크숍"} 일정`);
    }
  }

  return blocks;
}

function enrichWorkshopSlots(
  workshop,
  reservationCounts = new Map(),
  scheduleBlocks = new Map(),
  scheduledDateBlocks = new Map(),
  privateDailyDates = new Set(),
) {
  const todayIso = getTodayIsoInTimeZone();
  const bookingConfig = workshop.bookingConfig || {};
  const isDailyClass = bookingConfig.mode === "daily";
  const isMultiSession = bookingConfig.workshopType === WORKSHOP_TYPES.MULTI_SESSION
    || bookingConfig.type === WORKSHOP_TYPES.MULTI_SESSION;
  const seriesKey = isMultiSession ? `${workshop.slug}:series` : "";
  const sharedCapacity = isMultiSession
    ? Math.max(1, Number(bookingConfig.maxParticipants) || Number(workshop.maxCapacity) || 1)
    : 0;

  return {
    ...workshop,
    scheduleSlots: (workshop.scheduleSlots || []).map((slot) => {
      const reservedCount = reservationCounts.get(isMultiSession ? seriesKey : slot.key) || 0;
      const capacity = isMultiSession ? sharedCapacity : Math.max(0, Number(slot.capacity) || 0);
      const remainingCapacity = Math.max(capacity - reservedCount, 0);
      const pastOrToday = String(slot.date || "") <= todayIso;
      const manualBlock = scheduleBlocks.get(String(slot.date || "")) || null;
      const scheduledBlockReason = scheduledDateBlocks.get(String(slot.date || "")) || "";
      const hasPrivateDailyReservation = isDailyClass && privateDailyDates.has(String(slot.date || ""));
      const isBlocked = slot.status === "blocked" || Boolean(manualBlock) || Boolean(scheduledBlockReason) || remainingCapacity <= 0 || pastOrToday || hasPrivateDailyReservation;

      return {
        ...slot,
        reservedCount,
        remainingCapacity,
        status: isBlocked ? "blocked" : "open",
        blockedReason: slot.status === "blocked"
          ? slot.blockedReason || "예약 불가 일정입니다."
          : manualBlock
            ? manualBlock.reason || "예약 불가 일정입니다."
          : scheduledBlockReason
            ? `${scheduledBlockReason}로 해당 날짜는 예약할 수 없습니다.`
          : pastOrToday
            ? "당일 및 지난 날짜는 온라인 예약이 마감되었습니다."
          : hasPrivateDailyReservation
            ? "이미 private 신청이 있는 일일 클래스 날짜입니다."
          : remainingCapacity <= 0
            ? "예약 마감"
            : "",
      };
    }),
  };
}

export async function readWorkshopCatalog(env, slug) {
  const normalizedSlug = cleanText(slug, 120);
  const source = await readPublicWorkshopBySlug(env, normalizedSlug);

  if (!source) {
    throw Object.assign(new Error("워크숍 정보를 찾을 수 없습니다."), {
      status: 404,
    });
  }

  return readWorkshopBookingConfig(getDb(env), normalizeWorkshop(source));
}

async function enrichWorkshopAvailability(env, workshop) {
  const database = getDb(env);

  if (!database) {
    return workshop;
  }

  const isDailyClass = workshop.bookingConfig?.mode === "daily";
  const isMultiSession = workshop.bookingConfig?.workshopType === WORKSHOP_TYPES.MULTI_SESSION
    || workshop.bookingConfig?.type === WORKSHOP_TYPES.MULTI_SESSION;
  const reservationSlotKeys = workshop.scheduleSlots.map((slot) => slot.key);
  if (isMultiSession) {
    reservationSlotKeys.push(`${workshop.slug}:series`);
  }
  const [reservationCounts, scheduleBlocks, scheduledDateBlocks, privateDailyDates] = await Promise.all([
    readSlotReservationCounts(
      database,
      reservationSlotKeys,
    ),
    readWorkshopDateBlockMap(
      database,
      workshop.slug,
      workshop.scheduleSlots.map((slot) => slot.date),
    ),
    isDailyClass
      ? readScheduledWorkshopDateBlockMap(database, workshop.scheduleSlots.map((slot) => slot.date))
      : Promise.resolve(new Map()),
    isDailyClass
      ? readDailyPrivateReservationDates(database, workshop.slug, workshop.scheduleSlots.map((slot) => slot.date))
      : Promise.resolve(new Set()),
  ]);

  return enrichWorkshopSlots(workshop, reservationCounts, scheduleBlocks, scheduledDateBlocks, privateDailyDates);
}

export async function readWorkshopAvailability(env, slug) {
  const workshop = await readWorkshopCatalog(env, slug);
  return enrichWorkshopAvailability(env, workshop);
}

export async function readWorkshopAdminAvailability(env, slug) {
  const workshop = await readStoredWorkshopContentBySlug(env, cleanText(slug, 120), { includeDraft: true });
  if (!workshop) {
    throw Object.assign(new Error("워크숍 초안을 찾을 수 없습니다."), {
      status: 404,
    });
  }

  const configuredWorkshop = await readWorkshopBookingConfig(getDb(env), normalizeWorkshop(workshop));
  return enrichWorkshopAvailability(env, configuredWorkshop);
}

async function readWorkshopReservationsForAdmin(database, {
  query = "",
  status = "all",
  limit = 40,
} = {}) {
  if (!database) {
    return [];
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || 40, 200));
  const normalizedQuery = cleanText(query, 120);
  const likeQuery = `%${normalizedQuery}%`;
  const requestedStatus = String(status || "all").trim();
  const normalizedStatus = requestedStatus === "all" || RESERVATION_STATUSES.has(requestedStatus)
    ? requestedStatus
    : "all";

  const result = await database
    .prepare(`
      SELECT *
      FROM workshop_reservations
      WHERE (
        ? = ''
        OR workshop_title LIKE ?
        OR workshop_slug LIKE ?
        OR full_name LIKE ?
        OR phone LIKE ?
        OR email LIKE ?
        OR slot_date LIKE ?
      )
      AND (? = 'all' OR status = ?)
      ORDER BY slot_date ASC, slot_start_time ASC, created_at DESC
      LIMIT ?
    `)
    .bind(
      normalizedQuery,
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
      normalizedStatus,
      normalizedStatus,
      safeLimit,
    )
    .all();

  return (result?.results || []).map(formatReservation).filter(Boolean);
}

function getWorkshopGroupStatusLabel(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "open") return "모집 중";
  if (normalized === "finalized") return "모집 마감";
  if (normalized === "cancelled") return "취소";
  if (normalized === "expired") return "만료";
  return normalized || "모집 중";
}

function formatWorkshopGroup(row) {
  if (!row) return null;

  const priceSnapshot = decodeJson(row.price_snapshot, {});
  return {
    groupId: row.id,
    workshopSlug: row.workshop_slug,
    workshopTitle: row.workshop_title || row.workshop_slug || "워크숍",
    requestedDate: row.requested_date,
    groupMode: row.group_mode || "open",
    status: row.status || "open",
    statusLabel: getWorkshopGroupStatusLabel(row.status),
    currentParticipants: Math.max(0, Number(row.current_participants) || 0),
    maxParticipants: Math.max(1, Number(row.max_participants) || 1),
    finalParticipants: row.final_participants == null ? null : Math.max(0, Number(row.final_participants) || 0),
    finalAmount: Math.max(0, Number(priceSnapshot?.totalAmount) || 0),
    priceSnapshot,
    paidParticipants: Math.max(0, Number(row.paid_participants) || 0),
    paymentDueParticipants: Math.max(0, Number(row.payment_due_participants) || 0),
    paymentDeadlineAt: row.payment_deadline_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readWorkshopGroupsForAdmin(database, { limit = 80 } = {}) {
  if (!database) return [];

  const safeLimit = Math.max(1, Math.min(Number(limit) || 80, 200));
  const result = await database
    .prepare(`
      SELECT
        workshop_groups.*,
        workshops.title AS workshop_title,
        COALESCE(SUM(CASE WHEN workshop_reservations.payment_status = 'paid' THEN workshop_reservations.attendee_count ELSE 0 END), 0) AS paid_participants,
        COALESCE(SUM(CASE WHEN workshop_reservations.status = 'waiting_for_payment' THEN workshop_reservations.attendee_count ELSE 0 END), 0) AS payment_due_participants
      FROM workshop_groups
      LEFT JOIN workshops ON workshops.slug = workshop_groups.workshop_slug
      LEFT JOIN workshop_reservations ON workshop_reservations.group_id = workshop_groups.id
      GROUP BY workshop_groups.id
      ORDER BY workshop_groups.requested_date ASC, workshop_groups.created_at DESC
      LIMIT ?
    `)
    .bind(safeLimit)
    .all();

  return (result?.results || []).map(formatWorkshopGroup).filter(Boolean);
}

export async function readWorkshopAdminSnapshot(env, {
  query = "",
  status = "all",
  limit = 40,
} = {}) {
  const database = requireDb(env);
  const [reservations, blocks, catalog, groups] = await Promise.all([
    readWorkshopReservationsForAdmin(database, { query, status, limit }),
    readWorkshopDateBlocks(database),
    readWorkshopAdminCatalog(env),
    readWorkshopGroupsForAdmin(database),
  ]);

  return {
    reservations,
    blocks,
    workshops: catalog.workshopOptions,
    contentItems: catalog.contentItems,
    groups,
  };
}

export async function updateWorkshopReservationStatus(env, { reservationId, status }) {
  const database = requireDb(env);
  const normalizedId = cleanText(reservationId, 80);
  const normalizedStatus = String(status || "").trim().toLowerCase();
  if (!normalizedId || !["confirmed", "cancelled"].includes(normalizedStatus)) {
    throw Object.assign(new Error("예약 상태를 다시 확인해주세요."), {
      status: 400,
    });
  }

  const row = await database
    .prepare(`SELECT * FROM workshop_reservations WHERE id = ? LIMIT 1`)
    .bind(normalizedId)
    .first();

  if (!row) {
    throw Object.assign(new Error("예약 정보를 찾을 수 없습니다."), {
      status: 404,
    });
  }

  const now = nowIso();
  if (normalizedStatus === "cancelled") {
    if (row.payment_status === "paid") {
      throw Object.assign(new Error("결제 완료 신청은 환불 처리 후 취소해주세요."), {
        status: 409,
      });
    }

    await database
      .prepare(`
        UPDATE workshop_reservations
        SET status = 'cancelled',
            payment_status = CASE WHEN payment_status = 'not_required' THEN 'not_required' ELSE 'cancelled' END,
            cancelled_at = ?,
            updated_at = ?
        WHERE id = ?
      `)
      .bind(now, now, normalizedId)
      .run();

    if (row.payment_order_id) {
      await database
        .prepare(`
          UPDATE workshop_payment_orders
          SET status = 'cancelled', cancelled_at = ?, updated_at = ?
          WHERE id = ? AND status = 'pending'
        `)
        .bind(now, now, row.payment_order_id)
        .run();
    }
    if (row.group_id && row.status === "waiting_for_group") {
      await releaseWorkshopGroupParticipants(database, row.group_id, Math.max(1, Number(row.attendee_count) || 1));
    }
  } else if (row.booking_type === WORKSHOP_TYPES.DAILY && row.group_id) {
    const group = await readWorkshopGroup(database, row.group_id);
    if (!group || group.status !== "open") {
      throw Object.assign(new Error("모집 중인 그룹 신청만 복원할 수 있습니다."), { status: 409 });
    }

    const attendeeCount = Math.max(1, Number(row.attendee_count) || 1);
    const restored = await database
      .prepare(`
        UPDATE workshop_groups
        SET current_participants = current_participants + ?, updated_at = ?
        WHERE id = ?
          AND status = 'open'
          AND current_participants + ? <= max_participants
      `)
      .bind(attendeeCount, now, group.id, attendeeCount)
      .run();
    if (!didUpdateRow(restored)) {
      throw Object.assign(new Error("그룹 정원이 남아 있지 않아 복원할 수 없습니다."), { status: 409 });
    }

    await database
      .prepare(`
        UPDATE workshop_reservations
        SET status = 'waiting_for_group', payment_status = 'not_requested', updated_at = ?
        WHERE id = ?
      `)
      .bind(now, normalizedId)
      .run();
  } else {
    const requiresPayment = Math.max(0, Number(row.amount_due) || 0) > 0;
    await database
      .prepare(`
        UPDATE workshop_reservations
        SET status = ?,
            payment_status = ?,
            checkout_token = ?,
            updated_at = ?
        WHERE id = ?
      `)
      .bind(
        requiresPayment ? "waiting_for_payment" : "confirmed",
        requiresPayment ? "not_requested" : "not_required",
        requiresPayment ? createId("WSC") : null,
        now,
        normalizedId,
      )
      .run();
  }

  const updated = await database
    .prepare(`SELECT * FROM workshop_reservations WHERE id = ? LIMIT 1`)
    .bind(normalizedId)
    .first();

  return formatReservation(updated);
}

export async function createWorkshopDateBlock(env, {
  slotDate,
  reason,
}) {
  const database = requireDb(env);
  const normalizedSlug = GLOBAL_WORKSHOP_BLOCK_SLUG;
  const normalizedTitle = "전역 일정 차단";
  const normalizedDate = normalizeDateText(slotDate);
  const normalizedReason = cleanText(reason || "예약 불가 일정입니다.", 200) || "예약 불가 일정입니다.";

  if (!normalizedDate) {
    throw Object.assign(new Error("차단 날짜를 선택해주세요."), {
      status: 400,
    });
  }

  const now = nowIso();
  const blockId = createId("WSB");

  await database
    .prepare(`
      INSERT INTO workshop_schedule_blocks (
        id,
        workshop_slug,
        workshop_title,
        slot_date,
        reason,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workshop_slug, slot_date) DO UPDATE SET
        workshop_title = excluded.workshop_title,
        reason = excluded.reason,
        updated_at = excluded.updated_at
    `)
    .bind(
      blockId,
      normalizedSlug,
      normalizedTitle,
      normalizedDate,
      normalizedReason,
      now,
      now,
    )
    .run();

  const row = await database
    .prepare(`
      SELECT *
      FROM workshop_schedule_blocks
      WHERE workshop_slug = ?
        AND slot_date = ?
      LIMIT 1
    `)
    .bind(normalizedSlug, normalizedDate)
    .first();

  return formatWorkshopDateBlock(row);
}

export async function deleteWorkshopDateBlock(env, { blockId }) {
  const database = requireDb(env);
  const normalizedId = cleanText(blockId, 80);
  if (!normalizedId) {
    throw Object.assign(new Error("차단 일정을 다시 확인해주세요."), {
      status: 400,
    });
  }

  const row = await database
    .prepare(`SELECT * FROM workshop_schedule_blocks WHERE id = ? LIMIT 1`)
    .bind(normalizedId)
    .first();

  if (!row) {
    throw Object.assign(new Error("차단 일정을 찾을 수 없습니다."), {
      status: 404,
    });
  }

  await database
    .prepare(`DELETE FROM workshop_schedule_blocks WHERE id = ?`)
    .bind(normalizedId)
    .run();

  return formatWorkshopDateBlock(row);
}

export async function linkGuestWorkshopReservationsToUser(database, userId, emailNormalized) {
  if (!database || !userId || !emailNormalized) {
    return false;
  }

  await database
    .prepare(`
      UPDATE workshop_reservations
      SET user_id = COALESCE(user_id, ?),
          updated_at = ?
      WHERE user_id IS NULL
        AND email_normalized = ?
    `)
    .bind(userId, nowIso(), emailNormalized)
    .run();

  return true;
}

export async function readWorkshopReservationsForIdentity(database, { userId, emailNormalized }, limit = 20) {
  if (!database || (!userId && !emailNormalized)) {
    return [];
  }

  const result = await database
    .prepare(`
      SELECT *
      FROM workshop_reservations
      WHERE user_id = ?
         OR email_normalized = ?
      ORDER BY slot_date DESC, slot_start_time DESC, created_at DESC
      LIMIT ?
    `)
    .bind(userId || null, emailNormalized || "", limit)
    .all();

  return (result?.results || []).map(formatReservation);
}

function getApplicant(input, { userId = null, accountEmail = "", accountFullName = "", accountPhone = "" } = {}) {
  const email = normalizeEmail(userId ? (accountEmail || input.email) : input.email);
  const fullName = cleanText(userId ? (accountFullName || input.fullName) : input.fullName, 120);
  const phone = cleanText(userId ? (accountPhone || input.phone) : input.phone, 40);

  if (!email || !fullName || !phone) {
    throw Object.assign(new Error("이름, 이메일, 연락처를 모두 입력해 주세요."), {
      status: 400,
    });
  }

  return {
    userId: userId || null,
    email,
    fullName,
    phone,
    note: cleanText(input.note, 500),
  };
}

function getAttendeeCount(value, maximum) {
  const attendeeCount = Number(value);
  if (!Number.isInteger(attendeeCount) || attendeeCount < 1 || attendeeCount > maximum) {
    throw Object.assign(new Error(`신청 인원은 1명에서 ${maximum}명 사이로 선택해주세요.`), {
      status: 400,
    });
  }
  return attendeeCount;
}

function getReservationLocation(workshop) {
  return cleanText(workshop.locationName || workshop.locationAddress || "Studio OALUM", 200);
}

function getFixedAmount(workshop, bookingConfig) {
  return Math.max(0, Number(bookingConfig.fixedPrice) || Number(workshop.price) || 0);
}

function getTierAmount(bookingConfig, participantCount) {
  const priceTiers = bookingConfig.priceTiers && typeof bookingConfig.priceTiers === "object"
    ? bookingConfig.priceTiers
    : {};
  const amount = Number(priceTiers[participantCount]);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
}

function buildReservationValues({
  workshop,
  slot,
  applicant,
  attendeeCount,
  status,
  bookingType,
  amountDue = 0,
  paymentStatus = "not_required",
  joinPolicy = "private",
  requestedAmount = amountDue,
  finalAmount = amountDue,
  pricePending = false,
  groupId = null,
  checkoutId = null,
  priceSnapshot = {},
}) {
  const now = nowIso();
  const normalizedAmountDue = Math.max(0, Math.round(Number(amountDue) || 0));
  const normalizedRequestedAmount = Math.max(0, Math.round(Number(requestedAmount) || 0));
  const normalizedFinalAmount = finalAmount == null ? null : Math.max(0, Math.round(Number(finalAmount) || 0));

  return {
    id: createId("WSR"),
    userId: applicant.userId,
    email: applicant.email,
    fullName: applicant.fullName,
    phone: applicant.phone,
    workshopSlug: workshop.slug,
    workshopTitle: workshop.title || "Workshop",
    workshopCategory: workshop.category || "",
    workshopLocation: getReservationLocation(workshop),
    slotKey: slot.key,
    slotLabel: cleanText(slot.label || `${slot.date} ${slot.startTime}`, 160),
    slotDate: slot.date,
    slotStartTime: slot.startTime || "00:00",
    slotEndTime: slot.endTime || "",
    attendeeCount,
    status,
    note: applicant.note,
    workshopSnapshot: encodeJson({
      title: workshop.title || "Workshop",
      category: workshop.category || "",
      locationName: workshop.locationName || "",
      locationAddress: workshop.locationAddress || "",
      bookingType,
      joinPolicy: normalizeJoinPolicy(joinPolicy),
      amountDue: normalizedAmountDue,
      attendeeCount,
    }),
    slotSnapshot: encodeJson(slot.snapshot || slot),
    groupId,
    bookingType,
    joinPolicy: normalizeJoinPolicy(joinPolicy),
    paymentStatus,
    requestedAmount: normalizedRequestedAmount,
    finalAmount: normalizedFinalAmount,
    pricePending: pricePending ? 1 : 0,
    amountDue: normalizedAmountDue,
    amountPaid: 0,
    paymentOrderId: null,
    checkoutId,
    priceSnapshot: encodeJson(priceSnapshot, {}),
    paidAt: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

async function insertOrReopenWorkshopReservation(database, values) {
  const existing = await database
    .prepare(`
      SELECT *
      FROM workshop_reservations
      WHERE slot_key = ?
        AND email_normalized = ?
      LIMIT 1
    `)
    .bind(values.slotKey, values.email)
    .first();

  if (existing && !["cancelled", "expired"].includes(String(existing.status || "").trim())) {
    throw Object.assign(new Error("같은 이메일로 이미 진행 중인 신청이 있습니다."), {
      status: 409,
    });
  }

  if (existing) {
    await database
      .prepare(`
        UPDATE workshop_reservations
        SET user_id = COALESCE(?, user_id),
            email = ?,
            email_normalized = ?,
            full_name = ?,
            phone = ?,
            workshop_slug = ?,
            workshop_title = ?,
            workshop_category = ?,
            workshop_location = ?,
            slot_key = ?,
            slot_label = ?,
            slot_date = ?,
            slot_start_time = ?,
            slot_end_time = ?,
            attendee_count = ?,
            status = ?,
            note = ?,
            workshop_snapshot = ?,
            slot_snapshot = ?,
            group_id = ?,
            booking_type = ?,
            join_policy = ?,
            payment_status = ?,
            requested_amount = ?,
            final_amount = ?,
            price_pending = ?,
            amount_due = ?,
            amount_paid = ?,
            payment_order_id = ?,
            checkout_token = ?,
            price_snapshot = ?,
            paid_at = ?,
            cancelled_at = ?,
            updated_at = ?
        WHERE id = ?
      `)
      .bind(
        values.userId,
        values.email,
        values.email,
        values.fullName,
        values.phone,
        values.workshopSlug,
        values.workshopTitle,
        values.workshopCategory,
        values.workshopLocation,
        values.slotKey,
        values.slotLabel,
        values.slotDate,
        values.slotStartTime,
        values.slotEndTime,
        values.attendeeCount,
        values.status,
        values.note,
        values.workshopSnapshot,
        values.slotSnapshot,
        values.groupId,
        values.bookingType,
        values.joinPolicy,
        values.paymentStatus,
        values.requestedAmount,
        values.finalAmount,
        values.pricePending,
        values.amountDue,
        values.amountPaid,
        values.paymentOrderId,
        values.checkoutId,
        values.priceSnapshot,
        values.paidAt,
        values.cancelledAt,
        values.updatedAt,
        existing.id,
      )
      .run();

    return database.prepare(`SELECT * FROM workshop_reservations WHERE id = ? LIMIT 1`).bind(existing.id).first();
  }

  await database
    .prepare(`
      INSERT INTO workshop_reservations (
        id, user_id, email, email_normalized, full_name, phone,
        workshop_slug, workshop_title, workshop_category, workshop_location,
        slot_key, slot_label, slot_date, slot_start_time, slot_end_time,
        attendee_count, status, note, workshop_snapshot, slot_snapshot,
        group_id, booking_type, join_policy, payment_status,
        requested_amount, final_amount, price_pending, amount_due, amount_paid,
        payment_order_id, checkout_token, price_snapshot, paid_at, cancelled_at,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `)
    .bind(
      values.id,
      values.userId,
      values.email,
      values.email,
      values.fullName,
      values.phone,
      values.workshopSlug,
      values.workshopTitle,
      values.workshopCategory,
      values.workshopLocation,
      values.slotKey,
      values.slotLabel,
      values.slotDate,
      values.slotStartTime,
      values.slotEndTime,
      values.attendeeCount,
      values.status,
      values.note,
      values.workshopSnapshot,
      values.slotSnapshot,
      values.groupId,
      values.bookingType,
      values.joinPolicy,
      values.paymentStatus,
      values.requestedAmount,
      values.finalAmount,
      values.pricePending,
      values.amountDue,
      values.amountPaid,
      values.paymentOrderId,
      values.checkoutId,
      values.priceSnapshot,
      values.paidAt,
      values.cancelledAt,
      values.createdAt,
      values.updatedAt,
    )
    .run();

  return database.prepare(`SELECT * FROM workshop_reservations WHERE id = ? LIMIT 1`).bind(values.id).first();
}

async function assertOpenGroupDateAvailable(database, workshop, requestedDate) {
  const date = normalizeDateText(requestedDate);
  if (!date) {
    throw Object.assign(new Error("희망 날짜를 선택해주세요."), { status: 400 });
  }
  if (date <= getTodayIsoInTimeZone()) {
    throw Object.assign(new Error("당일 및 지난 날짜는 신청할 수 없습니다."), { status: 409 });
  }
  if (!(workshop.scheduleSlots || []).some((slot) => slot.date === date)) {
    throw Object.assign(new Error("선택 가능한 예약 기간을 벗어났습니다."), { status: 409 });
  }

  const [manualBlocks, scheduledBlocks] = await Promise.all([
    readWorkshopDateBlockMap(database, workshop.slug, [date]),
    readScheduledWorkshopDateBlockMap(database, [date]),
  ]);
  const manualBlock = manualBlocks.get(date);
  const scheduledBlock = scheduledBlocks.get(date);

  if (manualBlock) {
    throw Object.assign(new Error(manualBlock.reason || "선택한 날짜는 신청할 수 없습니다."), { status: 409 });
  }
  if (scheduledBlock) {
    throw Object.assign(new Error(`${scheduledBlock}과 겹쳐 선택할 수 없습니다.`), { status: 409 });
  }

  return date;
}

async function assertDailyJoinPolicyAvailable(database, workshop, requestedDate, joinPolicy, attendeeCount) {
  const result = await database
    .prepare(`
      SELECT join_policy, attendee_count
      FROM workshop_reservations
      WHERE workshop_slug = ?
        AND slot_date = ?
        AND status IN ('waiting_for_group', 'waiting_for_payment', 'confirmed')
    `)
    .bind(workshop.slug, requestedDate)
    .all();
  const reservations = result?.results || [];

  if (reservations.length === 0) return;

  const hasPrivateReservation = reservations.some((reservation) => normalizeJoinPolicy(reservation.join_policy) === "private");
  if (joinPolicy === "private" || hasPrivateReservation) {
    throw Object.assign(new Error("private 신청과 추가 모집 신청은 같은 날짜에 함께 받을 수 없습니다."), { status: 409 });
  }

  const currentAttendees = reservations.reduce(
    (total, reservation) => total + Math.max(0, Number(reservation.attendee_count) || 0),
    0,
  );
  const capacity = Math.max(1, Math.min(4, Number(workshop.bookingConfig?.dailyCapacity) || 4));
  if (currentAttendees + attendeeCount > capacity) {
    throw Object.assign(new Error("남은 정원보다 많은 인원을 신청할 수 없습니다."), { status: 409 });
  }
}

function didUpdateRow(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0) > 0;
}

async function findOrCreateWorkshopGroup(database, {
  workshopSlug,
  requestedDate,
  groupMode,
  attendeeCount,
  maxParticipants,
  priceTiers,
}) {
  const now = nowIso();

  if (groupMode === "open") {
    const candidates = await database
      .prepare(`
        SELECT *
        FROM workshop_groups
        WHERE workshop_slug = ?
          AND requested_date = ?
          AND group_mode = 'open'
          AND status = 'open'
        ORDER BY created_at ASC
      `)
      .bind(workshopSlug, requestedDate)
      .all();

    for (const candidate of candidates?.results || []) {
      const update = await database
        .prepare(`
          UPDATE workshop_groups
          SET current_participants = current_participants + ?,
              updated_at = ?
          WHERE id = ?
            AND status = 'open'
            AND current_participants + ? <= max_participants
        `)
        .bind(attendeeCount, now, candidate.id, attendeeCount)
        .run();

      if (didUpdateRow(update)) {
        const group = await database.prepare(`SELECT * FROM workshop_groups WHERE id = ? LIMIT 1`).bind(candidate.id).first();
        return { group, created: false };
      }
    }

    if ((candidates?.results || []).length > 0) {
      throw Object.assign(new Error("해당 날짜의 추가 모집 정원이 마감되었습니다."), { status: 409 });
    }
  }

  const groupId = createId("WSG");
  await database
    .prepare(`
      INSERT INTO workshop_groups (
        id, workshop_slug, requested_date, group_mode, status,
        current_participants, max_participants, price_snapshot,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)
    `)
    .bind(
      groupId,
      workshopSlug,
      requestedDate,
      groupMode,
      attendeeCount,
      maxParticipants,
      encodeJson({ priceTiers: normalizePriceTiers(priceTiers) }),
      now,
      now,
    )
    .run();

  const group = await database.prepare(`SELECT * FROM workshop_groups WHERE id = ? LIMIT 1`).bind(groupId).first();
  return { group, created: true };
}

async function releaseWorkshopGroupParticipants(database, groupId, attendeeCount, removeEmpty = false) {
  if (!groupId) return;

  const group = await database.prepare(`SELECT * FROM workshop_groups WHERE id = ? LIMIT 1`).bind(groupId).first();
  if (!group) return;

  const nextCount = Math.max(0, Number(group.current_participants) - attendeeCount);
  if (removeEmpty && nextCount === 0 && group.status === "open") {
    await database.prepare(`DELETE FROM workshop_groups WHERE id = ?`).bind(groupId).run();
    return;
  }

  await database
    .prepare(`UPDATE workshop_groups SET current_participants = ?, updated_at = ? WHERE id = ?`)
    .bind(nextCount, nowIso(), groupId)
    .run();
}

async function readActiveParticipantCount(database, slotKey) {
  const row = await database
    .prepare(`
      SELECT COALESCE(SUM(attendee_count), 0) AS participant_count
      FROM workshop_reservations
      WHERE slot_key = ?
        AND status IN ('waiting_for_payment', 'confirmed')
    `)
    .bind(slotKey)
    .first();
  return Math.max(0, Number(row?.participant_count) || 0);
}

function buildMultiSessionSlot(workshop) {
  const slots = workshop.scheduleSlots || [];
  const slot = slots[0];
  if (!slot || slots.length < 2) {
    throw Object.assign(new Error("결제할 전체 회차 일정이 아직 등록되지 않았습니다."), { status: 409 });
  }
  const unavailableSlot = slots.find((item) => item.status === "blocked");
  if (unavailableSlot) {
    throw Object.assign(new Error(unavailableSlot.blockedReason || "전체 회차 중 예약할 수 없는 일정이 있습니다."), { status: 409 });
  }

  return {
    ...slot,
    key: `${workshop.slug}:series`,
    label: "전체 회차",
    snapshot: {
      type: "multiSession",
      slots: slots.map((item) => ({
        date: item.date,
        startTime: item.startTime,
        endTime: item.endTime || "",
      })),
    },
  };
}

async function createPaymentRequiredReservation(env, database, workshop, {
  slot,
  attendeeCount,
  applicant,
  bookingType,
  amountDue,
  joinPolicy = "private",
  priceSnapshot = {},
}) {
  const amount = Math.max(0, Math.round(Number(amountDue) || 0));
  const checkoutId = amount > 0 ? createId("WSC") : null;
  const reservation = await insertOrReopenWorkshopReservation(database, buildReservationValues({
    workshop,
    slot,
    applicant,
    attendeeCount,
    status: amount > 0 ? "waiting_for_payment" : "confirmed",
    bookingType,
    amountDue: amount,
    joinPolicy,
    requestedAmount: amount,
    finalAmount: amount,
    paymentStatus: amount > 0 ? "awaiting_payment" : "not_required",
    checkoutId,
    priceSnapshot: {
      ...priceSnapshot,
      fixedPrice: amount,
      attendeeCount,
      bookingType,
    },
  }));

  return {
    reservation: formatReservation(reservation),
    workshop: await readWorkshopAvailability(env, workshop.slug),
    requiresPayment: amount > 0,
    checkoutId,
  };
}

export async function createDailyWorkshopReservation(env, input, identity = {}) {
  const database = requireDb(env);
  const workshop = await readWorkshopAvailability(env, input.slug);
  const bookingConfig = getWorkshopBookingConfig(workshop);
  const maximum = Math.max(1, Math.min(4, Number(bookingConfig.dailyCapacity || bookingConfig.maxParticipants) || 4));
  const attendeeCount = getAttendeeCount(input.attendeeCount, maximum);
  const applicant = getApplicant(input, identity);
  const requestedDate = await assertOpenGroupDateAvailable(database, workshop, input.requestedDate);
  const joinPolicy = input.allowAdditionalAttendees === true
    ? "open"
    : normalizeJoinPolicy(input.joinPolicy || input.groupMode);
  const slot = (workshop.scheduleSlots || []).find((item) => item.date === requestedDate && item.status !== "blocked");
  if (!slot) {
    throw Object.assign(new Error("선택한 날짜에 예약 가능한 일일 워크샵이 없습니다."), { status: 409 });
  }

  await assertDailyJoinPolicyAvailable(database, workshop, requestedDate, joinPolicy, attendeeCount);

  if (joinPolicy === "private") {
    const amountDue = getTierAmount(bookingConfig, attendeeCount);
    return createPaymentRequiredReservation(env, database, workshop, {
      slot,
      attendeeCount,
      applicant,
      bookingType: WORKSHOP_TYPES.DAILY,
      amountDue,
      joinPolicy,
      priceSnapshot: {
        attendeePrices: normalizePriceTiers(bookingConfig.attendeePrices),
        requestedDate,
      },
    });
  }

  const groupResult = await findOrCreateWorkshopGroup(database, {
    workshopSlug: workshop.slug,
    requestedDate,
    groupMode: "open",
    attendeeCount,
    maxParticipants: maximum,
    priceTiers: bookingConfig.attendeePrices,
  });
  const group = groupResult.group;
  let reservation = null;

  try {
    reservation = await insertOrReopenWorkshopReservation(database, buildReservationValues({
      workshop,
      slot: {
        ...slot,
        label: `${requestedDate} 그룹 모집`,
      },
      applicant,
      attendeeCount,
      status: "waiting_for_group",
      bookingType: WORKSHOP_TYPES.DAILY,
      joinPolicy,
      paymentStatus: "pending_final_price",
      requestedAmount: 0,
      finalAmount: null,
      pricePending: true,
      groupId: group.id,
      priceSnapshot: {
        joinPolicy,
        requestedDate,
        attendeePrices: normalizePriceTiers(bookingConfig.attendeePrices),
      },
    }));

    if (Number(group.current_participants) >= maximum) {
      const finalized = await finalizeWorkshopGroup(env, { groupId: group.id });
      const finalizedReservation = finalized.reservations.find((item) => item.reservationId === reservation.id) || formatReservation(reservation);
      return {
        reservation: finalizedReservation,
        workshop: await readWorkshopAvailability(env, workshop.slug),
        group: finalized.group,
        requiresPayment: Boolean(finalizedReservation.checkoutId),
        checkoutId: finalizedReservation.checkoutId || null,
      };
    }

    return {
      reservation: formatReservation(reservation),
      workshop: await readWorkshopAvailability(env, workshop.slug),
      group: {
        groupId: group.id,
        requestedDate,
        joinPolicy,
        currentParticipants: Number(group.current_participants) || attendeeCount,
        maxParticipants: Number(group.max_participants) || maximum,
        status: group.status || "open",
      },
      requiresPayment: false,
    };
  } catch (error) {
    if (reservation?.id) {
      await database.prepare(`DELETE FROM workshop_reservations WHERE id = ?`).bind(reservation.id).run();
    }
    await releaseWorkshopGroupParticipants(database, group.id, attendeeCount, groupResult.created);
    throw error;
  }
}

export async function createOpenGroupApplication(env, input, identity = {}) {
  return createDailyWorkshopReservation(env, input, identity);
}

export async function createFixedWorkshopCheckout(env, input, identity = {}) {
  const database = requireDb(env);
  const workshop = await readWorkshopAvailability(env, input.slug);
  const bookingConfig = getWorkshopBookingConfig(workshop);
  const slotKey = cleanText(input.slotKey, 160);
  const slot = slotKey
    ? (workshop.scheduleSlots || []).find((item) => item.key === slotKey)
    : (workshop.scheduleSlots || []).find((item) => item.status !== "blocked");

  if (!slot) {
    throw Object.assign(new Error("선택한 예약 회차를 찾을 수 없습니다."), { status: 404 });
  }
  if (slot.status === "blocked") {
    throw Object.assign(new Error(slot.blockedReason || "선택한 일정은 예약할 수 없습니다."), { status: 409 });
  }

  const maximum = Math.max(1, Math.min(Number(slot.remainingCapacity || slot.capacity) || 1, bookingConfig.maxParticipants || 100));
  const attendeeCount = getAttendeeCount(input.attendeeCount, maximum);
  return createPaymentRequiredReservation(env, database, workshop, {
    slot,
    attendeeCount,
    applicant: getApplicant(input, identity),
    bookingType: WORKSHOP_TYPES.EVENT,
    amountDue: getFixedAmount(workshop, bookingConfig),
  });
}

export async function createMultiSessionCheckout(env, input, identity = {}) {
  const database = requireDb(env);
  const workshop = await readWorkshopAvailability(env, input.slug);
  const bookingConfig = getWorkshopBookingConfig(workshop);
  const slot = buildMultiSessionSlot(workshop);
  const maximum = Math.max(1, bookingConfig.maxParticipants || workshop.maxCapacity || 1);
  const attendeeCount = getAttendeeCount(input.attendeeCount, maximum);
  const alreadyReserved = await readActiveParticipantCount(database, slot.key);

  if (alreadyReserved + attendeeCount > maximum) {
    throw Object.assign(new Error("남은 정원보다 많은 인원을 신청할 수 없습니다."), { status: 409 });
  }

  return createPaymentRequiredReservation(env, database, workshop, {
    slot,
    attendeeCount,
    applicant: getApplicant(input, identity),
    bookingType: WORKSHOP_TYPES.MULTI_SESSION,
    amountDue: getFixedAmount(workshop, bookingConfig),
  });
}

export async function createWorkshopReservation(env, input, identity = {}) {
  const workshop = await readWorkshopCatalog(env, input.slug);
  const bookingType = getWorkshopBookingConfig(workshop).type;

  if (bookingType === WORKSHOP_TYPES.DAILY) {
    return createDailyWorkshopReservation(env, input, identity);
  }
  if (bookingType === WORKSHOP_TYPES.MULTI_SESSION) {
    return createMultiSessionCheckout(env, input, identity);
  }
  return createFixedWorkshopCheckout(env, input, identity);
}

function formatWorkshopPaymentOrder(row) {
  if (!row) return null;

  return {
    paymentOrderId: row.id,
    reservationId: row.reservation_id,
    workshopSlug: row.workshop_slug,
    orderId: row.order_id,
    amount: Math.max(0, Number(row.amount) || 0),
    currency: row.currency || "KRW",
    status: row.status || "pending",
    paymentKey: row.payment_key || null,
    provider: row.provider || "toss",
    providerStatus: row.provider_status || "",
    checkoutExpiresAt: row.checkout_expires_at,
    paidAt: row.paid_at || null,
    cancelledAt: row.cancelled_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function addHoursFrom(value, hours) {
  const date = new Date(value || Date.now());
  date.setHours(date.getHours() + Math.max(1, Number(hours) || 1));
  return date.toISOString();
}

function isExpired(value) {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) && time <= Date.now();
}

function buildWorkshopPaymentUrl(checkoutId, origin = "") {
  const path = `./workshop-payment?checkoutId=${encodeURIComponent(checkoutId)}`;
  return origin ? new URL(path, origin).toString() : path;
}

function escapeEmailHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function allocateGroupAmounts(reservations, totalAmount) {
  const participantTotal = reservations.reduce((total, reservation) => total + Math.max(0, Number(reservation.attendee_count) || 0), 0);
  if (participantTotal < 1) {
    throw Object.assign(new Error("그룹 신청 인원을 찾을 수 없습니다."), { status: 409 });
  }

  const amount = Math.max(0, Math.round(Number(totalAmount) || 0));
  const basePerParticipant = Math.floor(amount / participantTotal);
  let remainder = amount - (basePerParticipant * participantTotal);

  return reservations.map((reservation) => {
    const attendeeCount = Math.max(1, Number(reservation.attendee_count) || 1);
    const extra = Math.min(attendeeCount, remainder);
    remainder -= extra;
    return {
      reservation,
      attendeeCount,
      amountDue: (basePerParticipant * attendeeCount) + extra,
    };
  });
}

async function readWorkshopGroup(database, groupId) {
  return database.prepare(`SELECT * FROM workshop_groups WHERE id = ? LIMIT 1`).bind(groupId).first();
}

async function readGroupReservations(database, groupId, statuses = []) {
  const predicates = Array.isArray(statuses) && statuses.length > 0
    ? `AND status IN (${statuses.map(() => "?").join(", ")})`
    : "";
  const result = await database
    .prepare(`
      SELECT *
      FROM workshop_reservations
      WHERE group_id = ?
      ${predicates}
      ORDER BY created_at ASC, id ASC
    `)
    .bind(groupId, ...statuses)
    .all();
  return result?.results || [];
}

async function markReservationExpired(database, reservationId, paymentOrderId = null) {
  const now = nowIso();
  if (paymentOrderId) {
    await database
      .prepare(`UPDATE workshop_payment_orders SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'pending'`)
      .bind(now, paymentOrderId)
      .run();
  }
  await database
    .prepare(`
      UPDATE workshop_reservations
      SET status = 'expired', payment_status = 'expired', updated_at = ?
      WHERE id = ?
        AND status = 'waiting_for_payment'
    `)
    .bind(now, reservationId)
    .run();
}

async function reopenUnpaidWorkshopGroup(database, groupId, cancelledReservationId) {
  const group = await readWorkshopGroup(database, groupId);
  if (!group || group.status !== "finalized") return null;

  const reservations = await readGroupReservations(database, group.id);
  if (reservations.some((reservation) => reservation.payment_status === "paid")) {
    return formatWorkshopGroup(group);
  }

  const now = nowIso();
  const pendingReservationIds = reservations
    .filter((reservation) => reservation.id !== cancelledReservationId && reservation.status === "waiting_for_payment")
    .map((reservation) => reservation.id);

  if (pendingReservationIds.length > 0) {
    const placeholders = pendingReservationIds.map(() => "?").join(", ");
    await database
      .prepare(`
        UPDATE workshop_payment_orders
        SET status = 'cancelled',
            provider_status = 'group_reopened_after_payment_failure',
            cancelled_at = ?,
            updated_at = ?
        WHERE status = 'pending'
          AND reservation_id IN (${placeholders})
      `)
      .bind(now, now, ...pendingReservationIds)
      .run();
    await database
      .prepare(`
        UPDATE workshop_reservations
        SET status = 'waiting_for_group',
            payment_status = 'pending_final_price',
            requested_amount = 0,
            final_amount = NULL,
            price_pending = 1,
            amount_due = 0,
            payment_order_id = NULL,
            checkout_token = NULL,
            updated_at = ?
        WHERE id IN (${placeholders})
      `)
      .bind(now, ...pendingReservationIds)
      .run();
  }

  const remaining = await readGroupReservations(database, group.id, ["waiting_for_group"]);
  const currentParticipants = remaining.reduce(
    (total, reservation) => total + Math.max(0, Number(reservation.attendee_count) || 0),
    0,
  );
  await database
    .prepare(`
      UPDATE workshop_groups
      SET status = 'open',
          current_participants = ?,
          final_participants = NULL,
          payment_deadline_at = NULL,
          updated_at = ?
      WHERE id = ?
    `)
    .bind(currentParticipants, now, group.id)
    .run();

  return formatWorkshopGroup(await readWorkshopGroup(database, group.id));
}

export async function cancelPendingWorkshopPayment(env, { checkoutId, orderId = "" }) {
  const database = requireDb(env);
  const normalizedCheckoutId = cleanText(checkoutId, 100);
  const normalizedOrderId = cleanText(orderId, 100);
  const reservation = await readReservationForCheckout(database, normalizedCheckoutId);

  if (!reservation) {
    throw Object.assign(new Error("결제 대기 중인 워크숍 신청을 찾을 수 없습니다."), { status: 404 });
  }
  if (reservation.payment_status === "paid" || reservation.status === "confirmed") {
    throw Object.assign(new Error("결제 완료된 신청은 이 경로에서 취소할 수 없습니다."), { status: 409 });
  }
  if (["cancelled", "expired"].includes(reservation.status)) {
    return {
      reservation: formatReservation(reservation),
      group: reservation.group_id ? formatWorkshopGroup(await readWorkshopGroup(database, reservation.group_id)) : null,
    };
  }
  if (reservation.status !== "waiting_for_payment") {
    throw Object.assign(new Error("현재 취소할 수 없는 결제 요청입니다."), { status: 409 });
  }

  const paymentOrder = reservation.payment_order_id
    ? await database.prepare(`SELECT * FROM workshop_payment_orders WHERE id = ? LIMIT 1`).bind(reservation.payment_order_id).first()
    : null;
  if (normalizedOrderId && paymentOrder?.order_id !== normalizedOrderId) {
    throw Object.assign(new Error("결제 주문 정보를 확인할 수 없습니다."), { status: 409 });
  }

  const now = nowIso();
  if (paymentOrder?.status === "pending") {
    await database
      .prepare(`
        UPDATE workshop_payment_orders
        SET status = 'cancelled',
            provider_status = 'payment_failed',
            cancelled_at = ?,
            updated_at = ?
        WHERE id = ?
          AND status = 'pending'
      `)
      .bind(now, now, paymentOrder.id)
      .run();
  }

  await database
    .prepare(`
      UPDATE workshop_reservations
      SET status = 'cancelled',
          payment_status = 'cancelled',
          cancelled_at = ?,
          updated_at = ?
      WHERE id = ?
        AND status = 'waiting_for_payment'
    `)
    .bind(now, now, reservation.id)
    .run();

  const group = reservation.group_id
    ? await reopenUnpaidWorkshopGroup(database, reservation.group_id, reservation.id)
    : null;
  const updatedReservation = await database
    .prepare(`SELECT * FROM workshop_reservations WHERE id = ? LIMIT 1`)
    .bind(reservation.id)
    .first();

  return {
    reservation: formatReservation(updatedReservation),
    group,
  };
}

async function getCheckoutExpiry(database, reservation, bookingConfig) {
  if (reservation.group_id) {
    const group = await readWorkshopGroup(database, reservation.group_id);
    if (group?.payment_deadline_at) {
      return group.payment_deadline_at;
    }
  }

  return addHoursFrom(reservation.updated_at || reservation.created_at, bookingConfig.paymentDeadlineHours);
}

export async function finalizeWorkshopGroup(env, { groupId }) {
  const database = requireDb(env);
  const normalizedGroupId = cleanText(groupId, 80);
  const group = await readWorkshopGroup(database, normalizedGroupId);

  if (!group) {
    throw Object.assign(new Error("워크숍 그룹을 찾을 수 없습니다."), { status: 404 });
  }
  if (group.status !== "open") {
    throw Object.assign(new Error("모집 중인 그룹만 마감할 수 있습니다."), { status: 409 });
  }

  const workshop = await readWorkshopCatalog(env, group.workshop_slug);
  const bookingConfig = getWorkshopBookingConfig(workshop);
  if (bookingConfig.type !== WORKSHOP_TYPES.DAILY) {
    throw Object.assign(new Error("날짜 신청형 워크숍 그룹만 마감할 수 있습니다."), { status: 409 });
  }

  const reservations = await readGroupReservations(database, group.id, ["waiting_for_group"]);
  const finalParticipants = reservations.reduce((total, reservation) => total + Math.max(0, Number(reservation.attendee_count) || 0), 0);
  if (finalParticipants < bookingConfig.minParticipants) {
    throw Object.assign(new Error(`최소 모집 인원 ${bookingConfig.minParticipants}명을 충족해야 마감할 수 있습니다.`), { status: 409 });
  }
  if (finalParticipants > Number(group.max_participants)) {
    throw Object.assign(new Error("그룹 정원을 초과한 신청이 있어 마감할 수 없습니다."), { status: 409 });
  }

  const totalAmount = getTierAmount(bookingConfig, finalParticipants);
  const allocations = allocateGroupAmounts(reservations, totalAmount);
  const paymentDeadlineAt = totalAmount > 0 ? addHoursIso(bookingConfig.paymentDeadlineHours) : null;
  const groupPriceSnapshot = {
    attendeePrices: normalizePriceTiers(bookingConfig.attendeePrices),
    finalParticipants,
    totalAmount,
  };
  const now = nowIso();

  await database
    .prepare(`
      UPDATE workshop_groups
      SET status = 'finalized',
          current_participants = ?,
          final_participants = ?,
          price_snapshot = ?,
          payment_deadline_at = ?,
          updated_at = ?
      WHERE id = ?
    `)
    .bind(finalParticipants, finalParticipants, encodeJson(groupPriceSnapshot), paymentDeadlineAt, now, group.id)
    .run();

  for (const allocation of allocations) {
    const checkoutId = allocation.amountDue > 0 ? createId("WSC") : null;
    await database
      .prepare(`
        UPDATE workshop_reservations
        SET status = ?,
            payment_status = ?,
          requested_amount = ?,
          final_amount = ?,
          price_pending = 0,
            amount_due = ?,
            checkout_token = ?,
            price_snapshot = ?,
            updated_at = ?
        WHERE id = ?
          AND status = 'waiting_for_group'
      `)
      .bind(
        allocation.amountDue > 0 ? "waiting_for_payment" : "confirmed",
        allocation.amountDue > 0 ? "awaiting_payment" : "not_required",
        allocation.amountDue,
        allocation.amountDue,
        allocation.amountDue,
        checkoutId,
        encodeJson({
          ...groupPriceSnapshot,
          attendeeCount: allocation.attendeeCount,
          amountDue: allocation.amountDue,
        }),
        now,
        allocation.reservation.id,
      )
      .run();
  }

  const finalizedGroup = await readWorkshopGroup(database, group.id);
  return {
    group: formatWorkshopGroup({
      ...finalizedGroup,
      workshop_title: workshop.title,
    }),
    reservations: (await readGroupReservations(database, group.id)).map(formatReservation),
  };
}

export async function cancelWorkshopGroup(env, { groupId }) {
  const database = requireDb(env);
  const normalizedGroupId = cleanText(groupId, 80);
  const group = await readWorkshopGroup(database, normalizedGroupId);

  if (!group) {
    throw Object.assign(new Error("워크숍 그룹을 찾을 수 없습니다."), { status: 404 });
  }
  if (["cancelled", "expired"].includes(String(group.status || ""))) {
    throw Object.assign(new Error("이미 종료된 그룹입니다."), { status: 409 });
  }

  const reservations = await readGroupReservations(database, group.id);
  if (reservations.some((reservation) => reservation.payment_status === "paid")) {
    throw Object.assign(new Error("결제 완료 신청은 먼저 환불한 뒤 그룹을 취소해주세요."), { status: 409 });
  }

  const now = nowIso();
  await database
    .prepare(`UPDATE workshop_groups SET status = 'cancelled', updated_at = ? WHERE id = ?`)
    .bind(now, group.id)
    .run();
  await database
    .prepare(`
      UPDATE workshop_reservations
      SET status = 'cancelled',
          payment_status = CASE WHEN payment_status = 'not_required' THEN 'not_required' ELSE 'cancelled' END,
          updated_at = ?
      WHERE group_id = ?
        AND status IN ('waiting_for_group', 'waiting_for_payment')
    `)
    .bind(now, group.id)
    .run();
  await database
    .prepare(`
      UPDATE workshop_payment_orders
      SET status = 'cancelled',
          provider_status = 'cancelled_before_payment',
          cancelled_at = ?,
          updated_at = ?
      WHERE status = 'pending'
        AND reservation_id IN (
          SELECT id
          FROM workshop_reservations
          WHERE group_id = ?
        )
    `)
    .bind(now, now, group.id)
    .run();

  return formatWorkshopGroup(await readWorkshopGroup(database, group.id));
}

async function sendWorkshopPaymentEmail(env, reservation, paymentUrl) {
  const resendApiKey = String(env?.RESEND_API_KEY || "").trim();
  const from = String(env?.RESEND_FROM_EMAIL || "").trim();
  if (!resendApiKey && !from) return false;
  if (!resendApiKey || !from) {
    throw Object.assign(new Error("워크숍 결제 요청 메일을 보내려면 RESEND_API_KEY와 RESEND_FROM_EMAIL을 모두 설정해야 합니다."), { status: 503 });
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [reservation.email],
      subject: `[Studio OALUM] ${reservation.workshop_title || "워크숍"} 결제 요청`,
      html: `<p>${escapeEmailHtml(reservation.full_name || "신청자")}님,</p><p>${escapeEmailHtml(reservation.workshop_title || "워크숍")} 결제 링크입니다.</p><p><a href="${escapeEmailHtml(paymentUrl)}">결제하기</a></p>`,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw Object.assign(new Error(payload?.message || "워크숍 결제 요청 메일을 보내지 못했습니다."), { status: response.status || 502 });
  }

  return true;
}

export async function sendWorkshopPaymentRequest(env, { groupId, origin = "" }) {
  const database = requireDb(env);
  const normalizedGroupId = cleanText(groupId, 80);
  const group = await readWorkshopGroup(database, normalizedGroupId);
  if (!group) {
    throw Object.assign(new Error("워크숍 그룹을 찾을 수 없습니다."), { status: 404 });
  }
  if (group.status !== "finalized") {
    throw Object.assign(new Error("모집 마감 후에만 결제 요청을 보낼 수 있습니다."), { status: 409 });
  }

  const reservations = await readGroupReservations(database, group.id, ["waiting_for_payment"]);
  if (reservations.length === 0) {
    throw Object.assign(new Error("결제 요청할 신청자가 없습니다."), { status: 409 });
  }

  const requests = [];
  let sentCount = 0;
  for (const reservation of reservations) {
    let checkoutId = String(reservation.checkout_token || "").trim();
    if (!checkoutId) {
      checkoutId = createId("WSC");
      await database
        .prepare(`UPDATE workshop_reservations SET checkout_token = ?, updated_at = ? WHERE id = ?`)
        .bind(checkoutId, nowIso(), reservation.id)
        .run();
    }
    const paymentUrl = buildWorkshopPaymentUrl(checkoutId, origin);
    const sent = await sendWorkshopPaymentEmail(env, reservation, paymentUrl);
    if (sent) sentCount += 1;
    requests.push({
      reservationId: reservation.id,
      email: reservation.email,
      checkoutId,
      paymentUrl,
      sent,
    });
  }

  return {
    group: formatWorkshopGroup(await readWorkshopGroup(database, group.id)),
    paymentRequests: requests,
    sentCount,
  };
}

async function readReservationForCheckout(database, checkoutId) {
  return database
    .prepare(`SELECT * FROM workshop_reservations WHERE checkout_token = ? LIMIT 1`)
    .bind(checkoutId)
    .first();
}

function buildCheckoutResponse(reservation, paymentOrder, workshop, clientKey) {
  return {
    checkoutId: reservation.checkout_token,
    order: formatWorkshopPaymentOrder(paymentOrder),
    workshop: {
      slug: workshop.slug,
      title: workshop.title || reservation.workshop_title,
    },
    customer: {
      name: reservation.full_name,
      email: reservation.email,
      phone: reservation.phone,
    },
    clientKey,
  };
}

export async function createWorkshopCheckout(env, { checkoutId }) {
  const database = requireDb(env);
  const normalizedCheckoutId = cleanText(checkoutId, 100);
  if (!normalizedCheckoutId) {
    throw Object.assign(new Error("결제 정보를 다시 확인해주세요."), { status: 400 });
  }

  const reservation = await readReservationForCheckout(database, normalizedCheckoutId);
  if (!reservation) {
    throw Object.assign(new Error("결제 대기 중인 워크숍 신청을 찾을 수 없습니다."), { status: 404 });
  }
  if (reservation.status !== "waiting_for_payment" || Number(reservation.amount_due) <= 0) {
    throw Object.assign(new Error("현재 결제할 수 없는 워크숍 신청입니다."), { status: 409 });
  }

  const workshop = await readWorkshopCatalog(env, reservation.workshop_slug);
  const bookingConfig = getWorkshopBookingConfig(workshop);
  const checkoutExpiresAt = await getCheckoutExpiry(database, reservation, bookingConfig);
  if (isExpired(checkoutExpiresAt)) {
    await markReservationExpired(database, reservation.id);
    throw Object.assign(new Error("결제 기한이 지나 신청이 만료되었습니다."), { status: 409 });
  }

  const tossConfig = getTossConfig(env);
  if (!tossConfig.isClientReady) {
    throw Object.assign(new Error("워크숍 결제 설정이 아직 준비되지 않았습니다."), { status: 503 });
  }

  const existingOrder = await database
    .prepare(`
      SELECT *
      FROM workshop_payment_orders
      WHERE id = ?
        AND reservation_id = ?
        AND status = 'pending'
      LIMIT 1
    `)
    .bind(reservation.payment_order_id || "", reservation.id)
    .first();

  if (existingOrder && !isExpired(existingOrder.checkout_expires_at)) {
    return buildCheckoutResponse(reservation, existingOrder, workshop, tossConfig.clientKey);
  }
  if (existingOrder) {
    await markReservationExpired(database, reservation.id, existingOrder.id);
    throw Object.assign(new Error("이전 결제 요청이 만료되었습니다. 관리자에게 문의해주세요."), { status: 409 });
  }

  const now = nowIso();
  const paymentOrderId = createId("WPO");
  const orderId = createId("WSP");
  const amount = Math.max(0, Math.round(Number(reservation.amount_due) || 0));
  await database
    .prepare(`
      INSERT INTO workshop_payment_orders (
        id, reservation_id, workshop_slug, order_id, amount, currency,
        status, provider, checkout_expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'KRW', 'pending', 'toss', ?, ?, ?)
    `)
    .bind(paymentOrderId, reservation.id, reservation.workshop_slug, orderId, amount, checkoutExpiresAt, now, now)
    .run();
  await database
    .prepare(`
      UPDATE workshop_reservations
      SET payment_order_id = ?, payment_status = 'pending', updated_at = ?
      WHERE id = ?
    `)
    .bind(paymentOrderId, now, reservation.id)
    .run();

  const paymentOrder = await database.prepare(`SELECT * FROM workshop_payment_orders WHERE id = ? LIMIT 1`).bind(paymentOrderId).first();
  const updatedReservation = await database.prepare(`SELECT * FROM workshop_reservations WHERE id = ? LIMIT 1`).bind(reservation.id).first();
  return buildCheckoutResponse(updatedReservation, paymentOrder, workshop, tossConfig.clientKey);
}

export async function confirmWorkshopPayment(env, { checkoutId, paymentKey, orderId, amount }) {
  const database = requireDb(env);
  const normalizedCheckoutId = cleanText(checkoutId, 100);
  const normalizedOrderId = cleanText(orderId, 100);
  const expectedAmount = Math.max(0, Math.round(Number(amount) || 0));
  const reservation = await readReservationForCheckout(database, normalizedCheckoutId);
  if (!reservation) {
    throw Object.assign(new Error("결제 대기 중인 워크숍 신청을 찾을 수 없습니다."), { status: 404 });
  }

  const paymentOrder = await database
    .prepare(`SELECT * FROM workshop_payment_orders WHERE id = ? LIMIT 1`)
    .bind(reservation.payment_order_id || "")
    .first();
  if (!paymentOrder) {
    throw Object.assign(new Error("결제 주문 정보를 찾을 수 없습니다."), { status: 404 });
  }
  if (paymentOrder.order_id !== normalizedOrderId || Number(paymentOrder.amount) !== expectedAmount) {
    throw Object.assign(new Error("결제 금액 또는 주문 정보가 일치하지 않습니다."), { status: 409 });
  }
  if (paymentOrder.status === "paid" && reservation.payment_status === "paid") {
    return {
      payment: formatWorkshopPaymentOrder(paymentOrder),
      reservation: formatReservation(reservation),
    };
  }
  if (paymentOrder.status !== "pending" || reservation.status !== "waiting_for_payment") {
    throw Object.assign(new Error("현재 승인할 수 없는 결제 요청입니다."), { status: 409 });
  }
  if (isExpired(paymentOrder.checkout_expires_at)) {
    await markReservationExpired(database, reservation.id, paymentOrder.id);
    throw Object.assign(new Error("결제 기한이 지나 신청이 만료되었습니다."), { status: 409 });
  }
  if (!String(paymentKey || "").trim()) {
    throw Object.assign(new Error("결제 승인 정보를 찾을 수 없습니다."), { status: 400 });
  }

  const payment = await confirmTossPayment(env, {
    paymentKey: String(paymentKey).trim(),
    orderId: normalizedOrderId,
    amount: expectedAmount,
  });
  if (payment.orderId !== paymentOrder.order_id || Number(payment.amount) !== Number(paymentOrder.amount)) {
    throw Object.assign(new Error("Toss 결제 승인 결과가 주문 정보와 일치하지 않습니다."), { status: 502 });
  }
  if (String(payment.status || "").toUpperCase() !== "DONE") {
    throw Object.assign(new Error("Toss 결제가 완료 상태가 아닙니다."), { status: 502 });
  }

  const now = nowIso();
  await database
    .prepare(`
      UPDATE workshop_payment_orders
      SET status = 'paid',
          payment_key = ?,
          provider_status = ?,
          paid_at = ?,
          raw_response = ?,
          updated_at = ?
      WHERE id = ?
        AND status = 'pending'
    `)
    .bind(payment.paymentKey, payment.status, payment.approvedAt || now, encodeJson(payment.rawResponse, {}), now, paymentOrder.id)
    .run();
  await database
    .prepare(`
      UPDATE workshop_reservations
      SET status = 'confirmed',
          payment_status = 'paid',
          amount_paid = ?,
          final_amount = COALESCE(final_amount, ?),
          paid_at = ?,
          updated_at = ?
      WHERE id = ?
        AND status = 'waiting_for_payment'
    `)
    .bind(paymentOrder.amount, paymentOrder.amount, payment.approvedAt || now, now, reservation.id)
    .run();

  const updatedOrder = await database.prepare(`SELECT * FROM workshop_payment_orders WHERE id = ? LIMIT 1`).bind(paymentOrder.id).first();
  const updatedReservation = await database.prepare(`SELECT * FROM workshop_reservations WHERE id = ? LIMIT 1`).bind(reservation.id).first();
  return {
    payment: formatWorkshopPaymentOrder(updatedOrder),
    reservation: formatReservation(updatedReservation),
  };
}

export async function refundWorkshopPayment(env, { reservationId, cancelReason = "관리자 요청으로 워크숍 결제를 취소했습니다." }) {
  const database = requireDb(env);
  const normalizedReservationId = cleanText(reservationId, 80);
  const reservation = await database
    .prepare(`SELECT * FROM workshop_reservations WHERE id = ? LIMIT 1`)
    .bind(normalizedReservationId)
    .first();
  if (!reservation) {
    throw Object.assign(new Error("워크숍 신청을 찾을 수 없습니다."), { status: 404 });
  }
  if (reservation.payment_status !== "paid" || !reservation.payment_order_id) {
    throw Object.assign(new Error("환불할 완료 결제를 찾을 수 없습니다."), { status: 409 });
  }

  const paymentOrder = await database
    .prepare(`SELECT * FROM workshop_payment_orders WHERE id = ? LIMIT 1`)
    .bind(reservation.payment_order_id)
    .first();
  if (!paymentOrder?.payment_key) {
    throw Object.assign(new Error("환불에 필요한 Toss 결제 정보를 찾을 수 없습니다."), { status: 409 });
  }

  const cancellation = await cancelTossPayment(env, {
    paymentKey: paymentOrder.payment_key,
    orderId: paymentOrder.order_id,
    amount: paymentOrder.amount,
    cancelReason: cleanText(cancelReason, 200) || "관리자 요청으로 워크숍 결제를 취소했습니다.",
  });
  const now = nowIso();
  await database
    .prepare(`
      UPDATE workshop_payment_orders
      SET status = 'refunded',
          provider_status = ?,
          cancelled_at = ?,
          raw_response = ?,
          updated_at = ?
      WHERE id = ?
    `)
    .bind(cancellation.status, cancellation.cancelledAt || now, encodeJson(cancellation.rawResponse, {}), now, paymentOrder.id)
    .run();
  await database
    .prepare(`
      UPDATE workshop_reservations
      SET status = 'cancelled', payment_status = 'refunded', cancelled_at = ?, updated_at = ?
      WHERE id = ?
    `)
    .bind(now, now, reservation.id)
    .run();

  const updatedOrder = await database.prepare(`SELECT * FROM workshop_payment_orders WHERE id = ? LIMIT 1`).bind(paymentOrder.id).first();
  const updatedReservation = await database.prepare(`SELECT * FROM workshop_reservations WHERE id = ? LIMIT 1`).bind(reservation.id).first();
  return {
    payment: formatWorkshopPaymentOrder(updatedOrder),
    reservation: formatReservation(updatedReservation),
  };
}

async function saveWorkshopBookingConfig(env, workshop) {
  const database = requireDb(env);
  const bookingConfig = getWorkshopBookingConfig(workshop);
  const now = nowIso();

  await database
    .prepare(`
      INSERT INTO workshop_booking_configs (
        workshop_slug, workshop_type, price_tiers_json, fixed_price,
        min_participants, max_participants, payment_deadline_hours,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workshop_slug) DO UPDATE SET
        workshop_type = excluded.workshop_type,
        price_tiers_json = excluded.price_tiers_json,
        fixed_price = excluded.fixed_price,
        min_participants = excluded.min_participants,
        max_participants = excluded.max_participants,
        payment_deadline_hours = excluded.payment_deadline_hours,
        updated_at = excluded.updated_at
    `)
    .bind(
      workshop.slug,
      bookingConfig.type,
      encodeJson(normalizePriceTiers(bookingConfig.priceTiers)),
      Math.max(0, Number(bookingConfig.fixedPrice) || 0),
      Math.max(1, Number(bookingConfig.minParticipants) || 1),
      Math.max(1, Number(bookingConfig.maxParticipants) || 4),
      Math.max(1, Number(bookingConfig.paymentDeadlineHours) || 48),
      now,
      now,
    )
    .run();
}

export async function upsertWorkshopContent(env, input) {
  const workshop = await upsertWorkshopContentRecord(env, input);
  await saveWorkshopBookingConfig(env, workshop);
  return readWorkshopBookingConfig(requireDb(env), workshop);
}

export { WORKSHOP_TYPES, archiveWorkshopContent, readPublicWorkshopCatalog, readStoredWorkshopCatalog };