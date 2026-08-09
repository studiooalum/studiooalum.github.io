import { ALL_WORKSHOPS_QUERY, WORKSHOP_BY_SLUG_QUERY } from "../../runtime/storefront/scripts/sanity/queries.js";
import {
  findFallbackWorkshopBySlug,
  getFallbackWorkshops,
  normalizeWorkshop,
  slugifyWorkshopTitle,
} from "../../runtime/storefront/scripts/utils/workshops.js";

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
    throw Object.assign(new Error("D1 binding is required for workshop content."), {
      status: 503,
    });
  }

  return database;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeStatus(value) {
  const normalized = String(value || "draft").trim().toLowerCase();
  return ["draft", "published", "archived"].includes(normalized) ? normalized : "draft";
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`.toUpperCase();
}

function decodeJson(value, fallback = null) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function encodeJson(value, fallback = []) {
  return JSON.stringify(value == null ? fallback : value);
}

function normalizeStringArray(values, maxItemLength = 200) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => cleanText(value, maxItemLength)).filter(Boolean);
}

function normalizeGalleryImages(values) {
  if (!Array.isArray(values)) return [];

  return values
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const url = cleanText(item.url, 2000);
      const r2Key = cleanText(item.r2Key, 500);
      if (!url && !r2Key) return null;

      return {
        url,
        r2Key,
        alt: cleanText(item.alt, 200),
        caption: cleanText(item.caption, 300),
        kind: cleanText(item.kind, 60),
      };
    })
    .filter(Boolean);
}

function normalizeScheduleSlots(values) {
  if (!Array.isArray(values)) return [];

  return values
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const date = cleanText(item.date, 10);
      const startTime = cleanText(item.startTime, 5);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)) {
        return null;
      }

      const isBlocked = item.isBlocked === true || String(item.status || "").trim().toLowerCase() === "blocked";

      return {
        _key: cleanText(item._key, 160),
        label: cleanText(item.label, 160),
        date,
        startTime,
        endTime: cleanText(item.endTime, 5),
        capacity: Math.max(1, Number(item.capacity) || 1),
        isBlocked,
        status: isBlocked ? "blocked" : "open",
        reason: cleanText(item.reason || item.blockedReason, 200),
      };
    })
    .filter(Boolean)
    .sort((left, right) => `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`));
}

function toImageValue(url, alt = "") {
  if (!url) return null;
  return {
    asset: {
      url,
    },
    alt,
  };
}

function formatWorkshopRow(row) {
  if (!row) return null;

  const galleryImages = normalizeGalleryImages(decodeJson(row.gallery_images_json, []));
  const posterImageUrl = cleanText(row.poster_image_url, 2000);
  const posterImageAlt = cleanText(row.poster_image_alt, 200);
  const workshop = normalizeWorkshop({
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    summary: row.summary,
    description: row.description,
    durationLabel: row.duration_label,
    levelLabel: row.level_label,
    audienceLabel: row.audience_label,
    maxCapacity: Number(row.max_capacity) || 0,
    capacityLabel: row.capacity_label || "",
    price: Number(row.price) || 0,
    bookingNotice: row.booking_notice || "",
    hostName: row.host_name || "",
    locationName: row.location_name || "",
    locationAddress: row.location_address || "",
    locationDetail: row.location_detail || "",
    materials: normalizeStringArray(decodeJson(row.materials_json, []), 200),
    thingsToBring: normalizeStringArray(decodeJson(row.things_to_bring_json, []), 200),
    scheduleSlots: normalizeScheduleSlots(decodeJson(row.schedule_slots_json, [])),
    bookingConfig: decodeJson(row.booking_config_json, {}),
    poster: toImageValue(posterImageUrl, posterImageAlt),
    posterImage: toImageValue(posterImageUrl, posterImageAlt),
    posterImageUrl,
    posterImageR2Key: row.poster_image_r2_key || "",
    posterImageAlt,
    galleryImages,
    images: galleryImages.map((item) => toImageValue(item.url, item.alt)).filter(Boolean),
    status: normalizeStatus(row.status),
    sourceMode: row.source_mode || "d1",
    sortOrder: Number(row.sort_order) || 0,
    publishedAt: row.published_at || "",
    archivedAt: row.archived_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    source: "d1",
  });

  return {
    ...workshop,
    summary: row.summary || workshop.summary,
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

async function fetchFallbackWorkshopBySlug(slug) {
  try {
    const workshop = await fetchSanityQuery(WORKSHOP_BY_SLUG_QUERY, { slug });
    if (workshop) {
      return normalizeWorkshop(workshop);
    }
  } catch (error) {
    console.error("Failed to fetch workshop from Sanity.", {
      slug,
      message: error?.message || String(error),
    });
  }

  return findFallbackWorkshopBySlug(slug);
}

async function fetchFallbackWorkshopCatalog() {
  try {
    const workshops = await fetchSanityQuery(ALL_WORKSHOPS_QUERY);
    if (Array.isArray(workshops) && workshops.length > 0) {
      return workshops.map((workshop) => normalizeWorkshop(workshop));
    }
  } catch (error) {
    console.error("Failed to fetch workshop catalog from Sanity.", {
      message: error?.message || String(error),
    });
  }

  return getFallbackWorkshops();
}

function mergeWorkshops(primary = [], secondary = []) {
  const merged = new Map();

  for (const workshop of [...primary, ...secondary]) {
    const normalized = normalizeWorkshop(workshop);
    const slug = cleanText(normalized.slug, 120);
    if (!slug || merged.has(slug)) continue;
    merged.set(slug, normalized);
  }

  return Array.from(merged.values()).sort((left, right) => {
    const sortDelta = (Number(left.sortOrder) || 0) - (Number(right.sortOrder) || 0);
    if (sortDelta !== 0) return sortDelta;
    return String(left.title || left.slug).localeCompare(String(right.title || right.slug), "ko");
  });
}

export async function readStoredWorkshopContentBySlug(env, slug, { includeDraft = false } = {}) {
  const database = getDb(env);
  if (!database) return null;

  const normalizedSlug = cleanText(slug, 120);
  if (!normalizedSlug) return null;

  const row = includeDraft
    ? await database.prepare(`SELECT * FROM workshops WHERE slug = ? LIMIT 1`).bind(normalizedSlug).first()
    : await database.prepare(`SELECT * FROM workshops WHERE slug = ? AND status = 'published' LIMIT 1`).bind(normalizedSlug).first();

  return formatWorkshopRow(row);
}

export async function readStoredWorkshopCatalog(env, { includeDraft = false } = {}) {
  const database = getDb(env);
  if (!database) return [];

  const result = includeDraft
    ? await database.prepare(`SELECT * FROM workshops ORDER BY sort_order ASC, updated_at DESC`).all()
    : await database.prepare(`SELECT * FROM workshops WHERE status = 'published' ORDER BY sort_order ASC, updated_at DESC`).all();

  return (result?.results || []).map(formatWorkshopRow).filter(Boolean);
}

export async function readPublicWorkshopBySlug(env, slug) {
  const stored = await readStoredWorkshopContentBySlug(env, slug);
  if (stored) return stored;
  return fetchFallbackWorkshopBySlug(slug);
}

export async function readPublicWorkshopCatalog(env) {
  const [stored, fallback] = await Promise.all([
    readStoredWorkshopCatalog(env),
    fetchFallbackWorkshopCatalog(),
  ]);

  return mergeWorkshops(stored, fallback);
}

export async function readWorkshopAdminCatalog(env) {
  const [storedAll, fallback] = await Promise.all([
    readStoredWorkshopCatalog(env, { includeDraft: true }),
    fetchFallbackWorkshopCatalog(),
  ]);

  return {
    contentItems: storedAll,
    workshopOptions: mergeWorkshops(storedAll, fallback).map((workshop) => ({
      slug: workshop.slug,
      title: workshop.title || workshop.slug,
      status: workshop.status || (storedAll.find((item) => item.slug === workshop.slug) ? "draft" : "external"),
      source: workshop.source || "fallback",
    })),
  };
}

export async function upsertWorkshopContent(env, input) {
  const database = requireDb(env);
  const title = cleanText(input.title, 160);
  const slug = cleanText(input.slug, 120) || slugifyWorkshopTitle(title);
  if (!title || !slug) {
    throw Object.assign(new Error("워크숍 제목과 slug를 확인해주세요."), {
      status: 400,
    });
  }

  const existing = await database.prepare(`SELECT * FROM workshops WHERE slug = ? LIMIT 1`).bind(slug).first();
  const now = nowIso();
  const status = normalizeStatus(input.status);
  const publishedAt = status === "published"
    ? cleanText(input.publishedAt, 40) || existing?.published_at || now
    : null;
  const archivedAt = status === "archived"
    ? existing?.archived_at || now
    : null;
  const scheduleSlots = normalizeScheduleSlots(input.scheduleSlots);
  const bookingConfig = input.bookingConfig && typeof input.bookingConfig === "object" ? input.bookingConfig : {};
  const galleryImages = normalizeGalleryImages(input.galleryImages);
  const materials = normalizeStringArray(input.materials, 200);
  const thingsToBring = normalizeStringArray(input.thingsToBring, 200);
  const id = cleanText(input.id, 80) || existing?.id || createId("WSC");

  await database
    .prepare(`
      INSERT INTO workshops (
        id,
        slug,
        title,
        category,
        summary,
        description,
        duration_label,
        level_label,
        audience_label,
        max_capacity,
        capacity_label,
        price,
        booking_notice,
        host_name,
        location_name,
        location_address,
        location_detail,
        materials_json,
        things_to_bring_json,
        poster_image_url,
        poster_image_r2_key,
        poster_image_alt,
        gallery_images_json,
        schedule_slots_json,
        booking_config_json,
        status,
        source_mode,
        sort_order,
        published_at,
        archived_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        title = excluded.title,
        category = excluded.category,
        summary = excluded.summary,
        description = excluded.description,
        duration_label = excluded.duration_label,
        level_label = excluded.level_label,
        audience_label = excluded.audience_label,
        max_capacity = excluded.max_capacity,
        capacity_label = excluded.capacity_label,
        price = excluded.price,
        booking_notice = excluded.booking_notice,
        host_name = excluded.host_name,
        location_name = excluded.location_name,
        location_address = excluded.location_address,
        location_detail = excluded.location_detail,
        materials_json = excluded.materials_json,
        things_to_bring_json = excluded.things_to_bring_json,
        poster_image_url = excluded.poster_image_url,
        poster_image_r2_key = excluded.poster_image_r2_key,
        poster_image_alt = excluded.poster_image_alt,
        gallery_images_json = excluded.gallery_images_json,
        schedule_slots_json = excluded.schedule_slots_json,
        booking_config_json = excluded.booking_config_json,
        status = excluded.status,
        source_mode = excluded.source_mode,
        sort_order = excluded.sort_order,
        published_at = excluded.published_at,
        archived_at = excluded.archived_at,
        updated_at = excluded.updated_at
    `)
    .bind(
      id,
      slug,
      title,
      cleanText(input.category, 80),
      cleanText(input.summary, 400),
      cleanText(input.description, 12000),
      cleanText(input.durationLabel, 80),
      cleanText(input.levelLabel, 80),
      cleanText(input.audienceLabel, 80),
      Math.max(0, Number(input.maxCapacity) || 0),
      cleanText(input.capacityLabel, 80),
      Math.max(0, Number(input.price) || 0),
      cleanText(input.bookingNotice, 500),
      cleanText(input.hostName, 120),
      cleanText(input.locationName, 160),
      cleanText(input.locationAddress, 240),
      cleanText(input.locationDetail, 240),
      encodeJson(materials),
      encodeJson(thingsToBring),
      cleanText(input.posterImageUrl, 2000),
      cleanText(input.posterImageR2Key, 500),
      cleanText(input.posterImageAlt, 200),
      encodeJson(galleryImages),
      encodeJson(scheduleSlots),
      encodeJson(bookingConfig, {}),
      status,
      cleanText(input.sourceMode, 40) || "d1-r2-ready",
      Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0,
      publishedAt,
      archivedAt,
      existing?.created_at || now,
      now,
    )
    .run();

  return readStoredWorkshopContentBySlug(env, slug, { includeDraft: true });
}

export async function archiveWorkshopContent(env, { slug }) {
  const database = requireDb(env);
  const normalizedSlug = cleanText(slug, 120);
  if (!normalizedSlug) {
    throw Object.assign(new Error("워크숍 slug를 확인해주세요."), {
      status: 400,
    });
  }

  const existing = await database.prepare(`SELECT * FROM workshops WHERE slug = ? LIMIT 1`).bind(normalizedSlug).first();
  if (!existing) {
    throw Object.assign(new Error("워크숍 콘텐츠를 찾을 수 없습니다."), {
      status: 404,
    });
  }

  await database
    .prepare(`UPDATE workshops SET status = 'archived', archived_at = ?, updated_at = ? WHERE slug = ?`)
    .bind(existing.archived_at || nowIso(), nowIso(), normalizedSlug)
    .run();

  return readStoredWorkshopContentBySlug(env, normalizedSlug, { includeDraft: true });
}