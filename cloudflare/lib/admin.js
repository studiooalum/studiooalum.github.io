import { constantTimeEqual } from "./request-security.js";

const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_SESSION_SCOPE = "order-admin";
const ADMIN_SESSION_TOKEN_PREFIX = "oaadm_";

function normalizeSecret(value) {
  return String(value || "").trim();
}

function getAdminSecret(env) {
  return normalizeSecret(env?.ORDER_ADMIN_SECRET);
}

function createAdminError(message, status) {
  return Object.assign(new Error(message), { status });
}

function randomHex(byteLength = 12) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashAdminToken(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readAdminTokenPayload(env, token) {
  const raw = normalizeSecret(token);
  if (!raw.startsWith(ADMIN_SESSION_TOKEN_PREFIX)) {
    return null;
  }
  if (!env?.OALUM_DB) return null;
  const row = await env.OALUM_DB.prepare(`
    SELECT id, created_at
    FROM admin_sessions
    WHERE token_hash = ? AND revoked_at IS NULL
    LIMIT 1
  `).bind(await hashAdminToken(raw)).first();
  const expiresAt = row ? Date.parse(row.created_at) + ADMIN_SESSION_TTL_MS : 0;
  return row && expiresAt > Date.now() ? { scope: ADMIN_SESSION_SCOPE, issuedAt: row.created_at, expiresAt: new Date(expiresAt).toISOString() } : null;
}

function getRequestCredential(request) {
  const authorization = normalizeSecret(request.headers.get("authorization"));
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  return normalizeSecret(request.headers.get("x-order-admin-key"));
}

export function isAdminAccessConfigured(env) {
  return Boolean(getAdminSecret(env));
}

export function getAdminSessionTtlMs() {
  return ADMIN_SESSION_TTL_MS;
}

export async function createAdminSession(env, submittedSecret) {
  if (!isAdminAccessConfigured(env)) {
    throw createAdminError("이 배포 환경에는 관리자 기능이 아직 활성화되어 있지 않습니다. ORDER_ADMIN_SECRET 설정을 확인해주세요.", 503);
  }

  const adminSecret = getAdminSecret(env);
  const candidate = normalizeSecret(submittedSecret);
  if (!candidate || !await constantTimeEqual(candidate, adminSecret)) {
    throw createAdminError("관리자 키를 다시 확인해주세요.", 401);
  }

  if (!env?.OALUM_DB) {
    throw createAdminError("관리자 세션 저장소가 준비되지 않았습니다.", 503);
  }
  const issuedAt = new Date().toISOString();
  const token = `${ADMIN_SESSION_TOKEN_PREFIX}${randomHex(32)}`;
  await env.OALUM_DB.prepare(`
    INSERT INTO admin_sessions (id, token_hash, created_at, revoked_at)
    VALUES (?, ?, ?, NULL)
  `).bind(`ADM_${randomHex(16)}`, await hashAdminToken(token), issuedAt).run();

  return {
    token,
    issuedAt,
    expiresAt: new Date(Date.parse(issuedAt) + ADMIN_SESSION_TTL_MS).toISOString(),
    ttlMs: ADMIN_SESSION_TTL_MS,
  };
}

export async function revokeAdminSession(context) {
  const token = getRequestCredential(context.request);
  if (!token || !context.env?.OALUM_DB) return false;
  const result = await context.env.OALUM_DB.prepare(`
    UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL
  `).bind(new Date().toISOString(), await hashAdminToken(token)).run();
  return Number(result?.meta?.changes ?? result?.changes ?? 0) > 0;
}

export async function requireAdminAccess(context, { allowSecret = false } = {}) {
  if (!isAdminAccessConfigured(context.env)) {
    throw createAdminError("이 배포 환경에는 관리자 기능이 아직 활성화되어 있지 않습니다. ORDER_ADMIN_SECRET 설정을 확인해주세요.", 503);
  }

  const credential = getRequestCredential(context.request);
  if (!credential) {
    throw createAdminError("관리자 인증이 필요합니다.", 401);
  }

  const session = await readAdminTokenPayload(context.env, credential);
  if (session) {
    return {
      authenticated: true,
      method: "session",
      issuedAt: session.issuedAt || null,
      expiresAt: session.expiresAt,
      ttlMs: ADMIN_SESSION_TTL_MS,
    };
  }

  if (allowSecret && await constantTimeEqual(credential, getAdminSecret(context.env))) {
    return {
      authenticated: true,
      method: "secret",
      issuedAt: null,
      expiresAt: null,
      ttlMs: ADMIN_SESSION_TTL_MS,
    };
  }

  throw createAdminError("관리자 인증이 필요합니다.", 401);
}