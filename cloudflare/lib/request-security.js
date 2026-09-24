export async function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const digests = await Promise.all([left, right].map((value) => crypto.subtle.digest("SHA-256", encoder.encode(String(value || "")))));
  const expected = new Uint8Array(digests[0]);
  const candidate = new Uint8Array(digests[1]);
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ candidate[index];
  return difference === 0;
}

export function assertSameOrigin(request, env = {}) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("Origin");
  if (!origin) return;
  const allowed = new Set([new URL(request.url).origin]);
  for (const value of [env.ALLOWED_ORIGIN, env.PUBLIC_SITE_URL, "https://studiooalum.com", "https://www.studiooalum.com"]) {
    try { if (value) allowed.add(new URL(value).origin); } catch {}
  }
  if (!allowed.has(origin)) throw Object.assign(new Error("허용되지 않은 요청입니다."), { status: 403 });
}

export async function enforceRateLimit(env, request, { scope, limit = 20, windowMs = 600000, subject = "" }) {
  if (!env.OALUM_DB) throw Object.assign(new Error("요청 처리 설정이 준비되지 않았습니다."), { status: 503 });
  const now = Date.now();
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${env.AUTH_SECRET || "oalum"}:${scope}:${subject || ip}`));
  const hash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  const result = await env.OALUM_DB.prepare(`INSERT INTO api_rate_limits(scope, subject_hash, bucket, hits, expires_at)
    VALUES (?, ?, ?, 1, ?) ON CONFLICT(scope, subject_hash, bucket) DO UPDATE SET hits = hits + 1 WHERE hits < ?`)
    .bind(scope, hash, Math.floor(now / windowMs), now + windowMs * 2, limit).run();
  if (!Number(result?.meta?.changes)) throw Object.assign(new Error("요청이 너무 많습니다. 잠시 후 다시 시도해주세요."), { status: 429 });
}