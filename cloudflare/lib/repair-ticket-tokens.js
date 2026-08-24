const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function cleanText(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function stringToBase64Url(value) {
  return bytesToBase64Url(new TextEncoder().encode(String(value)));
}

function base64UrlToString(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function signingSecret(env) {
  const secret = cleanText(env?.REPAIR_TICKET_ACCESS_SECRET || env?.AUTH_SECRET || env?.ORDER_ADMIN_SECRET, 2000);
  if (!secret) throw Object.assign(new Error("Repair Ticket access secret이 준비되지 않았습니다."), { status: 503 });
  return secret;
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

export async function createRepairTicketAccessToken(env, ticketId, options = {}) {
  const expiresAt = Date.now() + Math.max(60_000, Number(options.ttlMs || TOKEN_TTL_MS));
  const payload = stringToBase64Url(JSON.stringify({ ticketId: cleanText(ticketId, 80), expiresAt }));
  return `${payload}.${await hmac(signingSecret(env), payload)}`;
}

export async function verifyRepairTicketAccessToken(env, token, ticketId) {
  const [payload, signature] = cleanText(token, 4000).split(".");
  if (!payload || !signature) return false;
  const expected = await hmac(signingSecret(env), payload);
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) mismatch |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  if (mismatch !== 0) return false;
  try {
    const parsed = JSON.parse(base64UrlToString(payload));
    return parsed.ticketId === cleanText(ticketId, 80) && Number(parsed.expiresAt || 0) > Date.now();
  } catch {
    return false;
  }
}
