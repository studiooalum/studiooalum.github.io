import { WORKSHOP_BY_SLUG_QUERY } from "../../runtime/storefront/scripts/sanity/queries.js";
import { findFallbackWorkshopBySlug, normalizeWorkshop } from "../../runtime/storefront/scripts/utils/workshops.js";

const SANITY_PROJECT_ID = "9bsud0bl";
const SANITY_DATASET = "production";
const SANITY_API_VERSION = "2023-01-01";
const SANITY_BASE_URL = `https://${SANITY_PROJECT_ID}.apicdn.sanity.io/v${SANITY_API_VERSION}/data/query/${SANITY_DATASET}`;

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

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanText(value, maxLength = 200) {
  return String(value || "").trim().slice(0, maxLength);
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

function enrichWorkshopSlots(workshop, reservationCounts = new Map()) {
  return {
    ...workshop,
    scheduleSlots: (workshop.scheduleSlots || []).map((slot) => {
      const reservedCount = reservationCounts.get(slot.key) || 0;
      const remainingCapacity = Math.max((Number(slot.capacity) || 0) - reservedCount, 0);
      const isBlocked = slot.status === "blocked" || remainingCapacity <= 0;

      return {
        ...slot,
        reservedCount,
        remainingCapacity,
        status: isBlocked ? "blocked" : "open",
        blockedReason: slot.status === "blocked"
          ? slot.blockedReason || "예약 불가 일정입니다."
          : remainingCapacity <= 0
            ? "fully booked"
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

  const reservationCounts = await readSlotReservationCounts(
    database,
    workshop.scheduleSlots.map((slot) => slot.key),
  );

  return enrichWorkshopSlots(workshop, reservationCounts);
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