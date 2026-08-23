import { lookupGuestOrder } from "./auth.js";
import { lookupGuestRepairRequest } from "./repairs.js";
import { lookupGuestWorkshopReservation } from "./workshops.js";

const TOKEN_TTL_MS = 15 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 8;
const IP_RATE_LIMIT = 30;

function requireDb(env) {
  const database = env?.OALUM_DB;
  if (!database) {
    throw Object.assign(new Error("조회 서비스가 아직 준비되지 않았습니다."), { status: 503 });
  }
  return database;
}

function cleanText(value, maxLength = 200) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return cleanText(value, 320).toLowerCase();
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").toUpperCase()}`;
}

function createRandomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getReferenceType(reference) {
  const normalized = cleanText(reference, 160).toUpperCase();
  if (normalized.startsWith("REP-")) return "repair";
  if (normalized.startsWith("WKS-")) return "workshop";
  if (normalized.startsWith("ORD-") || normalized.startsWith("OALUM-CF-")) return "order";
  throw Object.assign(new Error("입력한 정보와 일치하는 신청 내역을 찾을 수 없습니다."), { status: 404 });
}

function getOrderId(reference) {
  const value = cleanText(reference, 160);
  return value.toUpperCase().startsWith("ORD-") ? value.slice(4) : value;
}

function getClientIp(request) {
  return cleanText(
    request?.headers?.get("CF-Connecting-IP")
      || request?.headers?.get("X-Forwarded-For")?.split(",")[0]
      || "unknown",
    80,
  );
}

async function createAccessToken(database, resourceType, resourceId, reference) {
  const token = createRandomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS).toISOString();
  await database.prepare(`
    INSERT INTO guest_lookup_tokens (
      token_hash, resource_type, resource_id, reference, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    await sha256(token),
    resourceType,
    cleanText(resourceId, 120),
    cleanText(reference, 160),
    expiresAt,
    now.toISOString(),
  ).run();
  return { token, expiresAt };
}

async function enforceRateLimit(database, request, email) {
  const now = new Date();
  const ipAddress = getClientIp(request);
  const clientKey = await sha256(`identity|${ipAddress}|${normalizeEmail(email)}`);
  const ipKey = await sha256(`ip|${ipAddress}`);
  const windowBucket = String(Math.floor(now.getTime() / RATE_WINDOW_MS));

  async function claimSlot(key, limit) {
    for (let slot = 1; slot <= limit; slot += 1) {
      try {
        await database.prepare(`
          INSERT INTO guest_lookup_rate_slots (client_key, window_bucket, slot, created_at)
          VALUES (?, ?, ?, ?)
        `).bind(key, windowBucket, slot, now.toISOString()).run();
        return;
      } catch (error) {
        if (/unique|constraint/i.test(String(error?.message || ""))) continue;
        throw error;
      }
    }
    throw Object.assign(new Error("조회 요청이 많습니다. 잠시 후 다시 시도해주세요."), { status: 429 });
  }

  await claimSlot(clientKey, RATE_LIMIT);
  await claimSlot(ipKey, IP_RATE_LIMIT);
  const attemptId = createId("GLA");
  await database.prepare(`
    INSERT INTO guest_lookup_attempts (id, client_key, attempted_at, succeeded)
    VALUES (?, ?, ?, 0)
  `).bind(attemptId, clientKey, now.toISOString()).run();
  return attemptId;
}

async function cleanExpiredGuestAccess(database, now) {
  const oldAttemptThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  await database.batch([
    database.prepare(`DELETE FROM guest_lookup_tokens WHERE expires_at < ?`).bind(now.toISOString()),
    database.prepare(`DELETE FROM guest_lookup_attempts WHERE attempted_at < ?`).bind(oldAttemptThreshold),
    database.prepare(`DELETE FROM guest_lookup_rate_slots WHERE created_at < ?`).bind(oldAttemptThreshold),
  ]);
}

export async function lookupGuestResource(env, request, { reference, email }) {
  const database = requireDb(env);
  const normalizedReference = cleanText(reference, 160);
  const emailNormalized = normalizeEmail(email);
  await cleanExpiredGuestAccess(database, new Date());
  const attemptId = await enforceRateLimit(database, request, emailNormalized);
  const resourceType = getReferenceType(normalizedReference);

  let resource;
  let resourceId;
  if (resourceType === "order") {
    const result = await lookupGuestOrder(env, { orderId: getOrderId(normalizedReference), email: emailNormalized });
    resource = result.order;
    resourceId = resource.orderId;
  } else if (resourceType === "workshop") {
    resource = await lookupGuestWorkshopReservation(env, { reference: normalizedReference, email: emailNormalized });
    resourceId = resource.reservationId;
  } else {
    resource = await lookupGuestRepairRequest(env, { reference: normalizedReference, email: emailNormalized });
    resourceId = resource.id;
  }

  const access = await createAccessToken(database, resourceType, resourceId, normalizedReference);
  await database.prepare(`UPDATE guest_lookup_attempts SET succeeded = 1 WHERE id = ?`).bind(attemptId).run();
  return {
    resourceType,
    resource,
    accessToken: access.token,
    expiresAt: access.expiresAt,
  };
}

export async function verifyGuestLookupToken(env, token, options = {}) {
  const database = requireDb(env);
  const rawToken = cleanText(token, 500);
  if (!rawToken) {
    throw Object.assign(new Error("조회 권한이 필요합니다."), { status: 401 });
  }
  const now = new Date();
  const row = await database.prepare(`
    SELECT token_hash, resource_type, resource_id, reference, expires_at
    FROM guest_lookup_tokens
    WHERE token_hash = ? AND expires_at > ?
    LIMIT 1
  `).bind(await sha256(rawToken), now.toISOString()).first();
  if (!row) {
    throw Object.assign(new Error("조회 권한이 만료되었습니다. 다시 조회해주세요."), { status: 401 });
  }
  if (options.resourceType && row.resource_type !== options.resourceType) {
    throw Object.assign(new Error("조회 권한이 올바르지 않습니다."), { status: 403 });
  }
  if (options.resourceId && row.resource_id !== options.resourceId) {
    throw Object.assign(new Error("조회 권한이 올바르지 않습니다."), { status: 403 });
  }
  await database.prepare(`
    UPDATE guest_lookup_tokens SET last_accessed_at = ? WHERE token_hash = ?
  `).bind(now.toISOString(), row.token_hash).run();
  return {
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    reference: row.reference,
    expiresAt: row.expires_at,
  };
}