import { ALL_WORKSHOPS_QUERY, WORKSHOP_BY_SLUG_QUERY } from "../../runtime/storefront/scripts/sanity/queries.js";
import { findFallbackWorkshopBySlug, getFallbackWorkshops, normalizeWorkshop } from "../../runtime/storefront/scripts/utils/workshops.js";

const SANITY_PROJECT_ID = "9bsud0bl";
const SANITY_DATASET = "production";
const SANITY_API_VERSION = "2023-01-01";
const SANITY_BASE_URL = `https://${SANITY_PROJECT_ID}.apicdn.sanity.io/v${SANITY_API_VERSION}/data/query/${SANITY_DATASET}`;
const WORKSHOP_TIME_ZONE = "Asia/Seoul";

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
    note: row.note || "",
    workshopSnapshot: decodeJson(row.workshop_snapshot, {}),
    slotSnapshot: decodeJson(row.slot_snapshot, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function fetchSanityQuery(query, params = {}) {
  const url = new URL(SANITY_BASE_URL);
  url.searchParams.set("query", query);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(`$${key}`, JSON.stringify(value));
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Sanity query failed: ${response.status} ${response.statusText}${body ? `\n${body}` : ""}`);
  }

  const payload = await response.json();
  return payload?.result || null;
}

async function fetchWorkshopSource(slug) {
  try {
    const workshop = await fetchSanityQuery(WORKSHOP_BY_SLUG_QUERY, { slug });
    if (workshop) {
      return workshop;
    }
  } catch (error) {
    console.error("Failed to fetch workshop from Sanity.", {
      slug,
      message: error?.message || String(error),
    });
  }

  return findFallbackWorkshopBySlug(slug);
}

async function fetchWorkshopCatalogSources() {
  try {
    const workshops = await fetchSanityQuery(ALL_WORKSHOPS_QUERY);
    if (Array.isArray(workshops) && workshops.length > 0) {
      return workshops;
    }
  } catch (error) {
    console.error("Failed to fetch workshop catalog from Sanity.", {
      message: error?.message || String(error),
    });
  }

  return getFallbackWorkshops();
}

async function readSlotReservationCounts(database, slotKeys = []) {
  if (!Array.isArray(slotKeys) || slotKeys.length === 0) {
    return new Map();
  }

  const placeholders = slotKeys.map(() => "?").join(", ");
  const result = await database
    .prepare(`
      SELECT slot_key, COALESCE(SUM(attendee_count), 0) AS reserved_count
      FROM workshop_reservations
      WHERE status = 'confirmed'
        AND slot_key IN (${placeholders})
      GROUP BY slot_key
    `)
    .bind(...slotKeys)
    .all();

  return new Map((result?.results || []).map((row) => [
    String(row.slot_key || "").trim(),
    Number(row.reserved_count) || 0,
  ]));
}

async function readWorkshopDateBlockMap(database, workshopSlug, dates = []) {
  if (!database || !workshopSlug || !Array.isArray(dates) || dates.length === 0) {
    return new Map();
  }

  const normalizedDates = Array.from(new Set(dates.map((value) => normalizeDateText(value)).filter(Boolean)));
  if (normalizedDates.length === 0) {
    return new Map();
  }

  const placeholders = normalizedDates.map(() => "?").join(", ");
  const result = await database
    .prepare(`
      SELECT *
      FROM workshop_schedule_blocks
      WHERE workshop_slug = ?
        AND slot_date IN (${placeholders})
    `)
    .bind(cleanText(workshopSlug, 120), ...normalizedDates)
    .all();

  return new Map((result?.results || []).map((row) => [
    String(row.slot_date || "").trim(),
    {
      id: row.id,
      workshopSlug: row.workshop_slug,
      workshopTitle: row.workshop_title || "",
      slotDate: row.slot_date,
      reason: row.reason || "예약 불가 일정입니다.",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  ]));
}

function formatWorkshopDateBlock(row) {
  if (!row) return null;

  return {
    id: row.id,
    workshopSlug: row.workshop_slug,
    workshopTitle: row.workshop_title || "",
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

function enrichWorkshopSlots(workshop, reservationCounts = new Map(), scheduleBlocks = new Map()) {
  const todayIso = getTodayIsoInTimeZone();

  return {
    ...workshop,
    scheduleSlots: (workshop.scheduleSlots || []).map((slot) => {
      const reservedCount = reservationCounts.get(slot.key) || 0;
      const remainingCapacity = Math.max((Number(slot.capacity) || 0) - reservedCount, 0);
      const pastOrToday = String(slot.date || "") <= todayIso;
      const manualBlock = scheduleBlocks.get(String(slot.date || "")) || null;
      const isBlocked = slot.status === "blocked" || Boolean(manualBlock) || remainingCapacity <= 0 || pastOrToday;

      return {
        ...slot,
        reservedCount,
        remainingCapacity,
        status: isBlocked ? "blocked" : "open",
        blockedReason: slot.status === "blocked"
          ? slot.blockedReason || "예약 불가 일정입니다."
          : manualBlock
            ? manualBlock.reason || "예약 불가 일정입니다."
          : pastOrToday
            ? "당일 및 지난 날짜는 온라인 예약이 마감되었습니다."
          : remainingCapacity <= 0
            ? "예약 마감"
            : "",
      };
    }),
  };
}

export async function readWorkshopCatalog(slug) {
  const normalizedSlug = cleanText(slug, 120);
  const source = await fetchWorkshopSource(normalizedSlug);

  if (!source) {
    throw Object.assign(new Error("워크숍 정보를 찾을 수 없습니다."), {
      status: 404,
    });
  }

  return normalizeWorkshop(source);
}

export async function readWorkshopAvailability(env, slug) {
  const workshop = await readWorkshopCatalog(slug);
  const database = getDb(env);

  if (!database) {
    return workshop;
  }

  const [reservationCounts, scheduleBlocks] = await Promise.all([
    readSlotReservationCounts(
      database,
      workshop.scheduleSlots.map((slot) => slot.key),
    ),
    readWorkshopDateBlockMap(
      database,
      workshop.slug,
      workshop.scheduleSlots.map((slot) => slot.date),
    ),
  ]);

  return enrichWorkshopSlots(workshop, reservationCounts, scheduleBlocks);
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
  const normalizedStatus = ["all", "confirmed", "cancelled"].includes(String(status || "all").trim())
    ? String(status || "all").trim()
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
      normalizedStatus,
      normalizedStatus,
      safeLimit,
    )
    .all();

  return (result?.results || []).map(formatReservation).filter(Boolean);
}

export async function readWorkshopAdminSnapshot(env, {
  query = "",
  status = "all",
  limit = 40,
} = {}) {
  const database = requireDb(env);
  const [reservations, blocks, workshops] = await Promise.all([
    readWorkshopReservationsForAdmin(database, { query, status, limit }),
    readWorkshopDateBlocks(database),
    fetchWorkshopCatalogSources(),
  ]);

  const workshopOptions = workshops
    .map((workshop) => normalizeWorkshop(workshop))
    .filter((workshop) => workshop?.slug)
    .map((workshop) => ({
      slug: workshop.slug,
      title: workshop.title || workshop.slug,
    }))
    .sort((left, right) => left.title.localeCompare(right.title, "ko"));

  return {
    reservations,
    blocks,
    workshops: workshopOptions,
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

  await database
    .prepare(`
      UPDATE workshop_reservations
      SET status = ?,
          updated_at = ?
      WHERE id = ?
    `)
    .bind(normalizedStatus, nowIso(), normalizedId)
    .run();

  const updated = await database
    .prepare(`SELECT * FROM workshop_reservations WHERE id = ? LIMIT 1`)
    .bind(normalizedId)
    .first();

  return formatReservation(updated);
}

export async function createWorkshopDateBlock(env, {
  workshopSlug,
  workshopTitle,
  slotDate,
  reason,
}) {
  const database = requireDb(env);
  const normalizedSlug = cleanText(workshopSlug, 120);
  const normalizedTitle = cleanText(workshopTitle, 160) || normalizedSlug;
  const normalizedDate = normalizeDateText(slotDate);
  const normalizedReason = cleanText(reason || "예약 불가 일정입니다.", 200) || "예약 불가 일정입니다.";

  if (!normalizedSlug || !normalizedDate) {
    throw Object.assign(new Error("워크숍과 날짜를 모두 선택해주세요."), {
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

export async function createWorkshopReservation(env, input, { userId = null, accountEmail = "", accountFullName = "", accountPhone = "" } = {}) {
  const database = requireDb(env);
  const workshop = await readWorkshopAvailability(env, input.slug);
  const slotKey = cleanText(input.slotKey, 160);
  const slot = (workshop.scheduleSlots || []).find((item) => item.key === slotKey);

  if (!slot) {
    throw Object.assign(new Error("선택한 예약 회차를 찾을 수 없습니다."), {
      status: 404,
    });
  }

  if (slot.status === "blocked") {
    throw Object.assign(new Error(slot.blockedReason || "선택한 일정은 예약할 수 없습니다."), {
      status: 409,
    });
  }

  const attendeeCount = Math.max(1, Number(input.attendeeCount) || 1);
  if (attendeeCount > slot.remainingCapacity) {
    throw Object.assign(new Error("남은 좌석 수보다 많은 인원을 예약할 수 없습니다."), {
      status: 409,
    });
  }

  const email = normalizeEmail(userId ? (accountEmail || input.email) : input.email);
  const fullName = cleanText(userId ? (accountFullName || input.fullName) : input.fullName, 120);
  const phone = cleanText(userId ? (accountPhone || input.phone) : input.phone, 40);
  const note = cleanText(input.note, 500);

  if (!email || !fullName || !phone) {
    throw Object.assign(new Error("이름, 이메일, 연락처를 모두 입력해 주세요."), {
      status: 400,
    });
  }

  const existing = await database
    .prepare(`
      SELECT id
      FROM workshop_reservations
      WHERE slot_key = ?
        AND email_normalized = ?
        AND status != 'cancelled'
      LIMIT 1
    `)
    .bind(slot.key, email)
    .first();

  if (existing) {
    throw Object.assign(new Error("같은 이메일로 이미 이 회차를 예약했습니다."), {
      status: 409,
    });
  }

  const now = nowIso();
  const reservationId = createId("WSR");

  await database
    .prepare(`
      INSERT INTO workshop_reservations (
        id,
        user_id,
        email,
        email_normalized,
        full_name,
        phone,
        workshop_slug,
        workshop_title,
        workshop_category,
        workshop_location,
        slot_key,
        slot_label,
        slot_date,
        slot_start_time,
        slot_end_time,
        attendee_count,
        status,
        note,
        workshop_snapshot,
        slot_snapshot,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?)
    `)
    .bind(
      reservationId,
      userId || null,
      email,
      email,
      fullName,
      phone,
      workshop.slug,
      workshop.title || "Workshop",
      workshop.category || "",
      cleanText(workshop.locationName || workshop.locationAddress || "Studio OALUM", 200),
      slot.key,
      cleanText(slot.label || `${slot.date} ${slot.startTime}`, 160),
      slot.date,
      slot.startTime,
      slot.endTime || "",
      attendeeCount,
      note,
      encodeJson({
        title: workshop.title || "Workshop",
        category: workshop.category || "",
        locationName: workshop.locationName || "",
        locationAddress: workshop.locationAddress || "",
        price: workshop.price || 0,
      }),
      encodeJson(slot),
      now,
      now,
    )
    .run();

  const row = await database
    .prepare(`SELECT * FROM workshop_reservations WHERE id = ? LIMIT 1`)
    .bind(reservationId)
    .first();

  return {
    reservation: formatReservation(row),
    workshop: await readWorkshopAvailability(env, workshop.slug),
  };
}