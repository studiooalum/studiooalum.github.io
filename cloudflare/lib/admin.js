const ADMIN_SESSION_TTL_MS = 30 * 60 * 1000;
const ADMIN_SESSION_SCOPE = "order-admin";
const ADMIN_SESSION_TOKEN_PREFIX = "oaadm_";

function normalizeSecret(value) {
  return String(value || "").trim();
}

function getAdminSecret(env) {
  return normalizeSecret(env?.ORDER_ADMIN_SECRET);
}

function getAdminSigningSecret(env) {
  const adminSecret = getAdminSecret(env);
  if (!adminSecret) {
    return "";
  }

  const authSecret = normalizeSecret(env?.AUTH_SECRET);
  return authSecret ? `${authSecret}:${adminSecret}` : adminSecret;
}

function createAdminError(message, status) {
  return Object.assign(new Error(message), { status });
}

function randomHex(byteLength = 12) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function stringToBase64Url(value) {
  return bytesToBase64Url(new TextEncoder().encode(String(value)));
}

function base64UrlToString(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmacBase64Url(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const buffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value)));
  return bytesToBase64Url(new Uint8Array(buffer));
}

async function readAdminTokenPayload(env, token) {
  const raw = normalizeSecret(token);
  if (!raw.startsWith(ADMIN_SESSION_TOKEN_PREFIX)) {
    return null;
  }

  const serialized = raw.slice(ADMIN_SESSION_TOKEN_PREFIX.length);
  const separatorIndex = serialized.indexOf(".");
  if (separatorIndex <= 0) {
    return null;
  }

  const encodedPayload = serialized.slice(0, separatorIndex);
  const signature = serialized.slice(separatorIndex + 1);
  if (!encodedPayload || !signature) {
    return null;
  }

  const signingSecret = getAdminSigningSecret(env);
  if (!signingSecret) {
    return null;
  }

  const expectedSignature = await hmacBase64Url(signingSecret, encodedPayload);
  if (expectedSignature !== signature) {
    return null;
  }

  let payload = null;
  try {
    payload = JSON.parse(base64UrlToString(encodedPayload));
  } catch {
    return null;
  }

  if (payload?.scope !== ADMIN_SESSION_SCOPE || !payload?.expiresAt) {
    return null;
  }

  const expiresAt = new Date(payload.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return null;
  }

  return payload;
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
  if (!candidate || candidate !== adminSecret) {
    throw createAdminError("관리자 키를 다시 확인해주세요.", 401);
  }

  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS).toISOString();
  const payload = {
    scope: ADMIN_SESSION_SCOPE,
    issuedAt,
    expiresAt,
    nonce: randomHex(10),
  };
  const encodedPayload = stringToBase64Url(JSON.stringify(payload));
  const signature = await hmacBase64Url(getAdminSigningSecret(env), encodedPayload);

  return {
    token: `${ADMIN_SESSION_TOKEN_PREFIX}${encodedPayload}.${signature}`,
    issuedAt,
    expiresAt,
    ttlMs: ADMIN_SESSION_TTL_MS,
  };
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

  if (allowSecret && credential === getAdminSecret(context.env)) {
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