import { assertSameOrigin, enforceRateLimit } from "../cloudflare/lib/request-security.js";
import { errorResponse } from "../cloudflare/lib/http.js";

const LIMITED_PATHS = new Map([
  ["/api/auth/login", 15], ["/api/auth/signup", 8], ["/api/auth/request", 5],
  ["/api/auth/verify", 15], ["/api/auth/password-reset/request", 5], ["/api/auth/password-reset/confirm", 10],
  ["/api/orders/admin-session", 10], ["/api/workshops/inquiries", 5], ["/api/workshops/reservations", 12],
  ["/api/repairs", 6], ["/api/orders", 15], ["/api/orders/quote", 60], ["/api/sanity/query", 100],
  ["/api/payments/confirm", 30], ["/api/repairs/payment", 30], ["/api/workshops/payment-confirm", 30],
]);

export async function onRequest(context) {
  try {
    const path = new URL(context.request.url).pathname.replace(/\/$/, "");
    if (!path.startsWith("/api/webhooks/")) assertSameOrigin(context.request, context.env);
    if (!["GET", "HEAD", "OPTIONS"].includes(context.request.method)) {
      const multipart = (context.request.headers.get("Content-Type") || "").includes("multipart/form-data");
      const maximum = multipart ? 40 * 1024 * 1024 : 1024 * 1024;
      if (Number(context.request.headers.get("Content-Length") || 0) > maximum) throw Object.assign(new Error("요청 크기가 너무 큽니다."), { status: 413 });
      const limit = LIMITED_PATHS.get(path);
      if (limit) await enforceRateLimit(context.env, context.request, { scope: path, limit });
    }
    const response = await context.next();
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    if (!headers.has("Cache-Control")) headers.set("Cache-Control", "private, no-store");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    const response = errorResponse(context.env, error);
    if (error.status === 429) response.headers.set("Retry-After", "600");
    return response;
  }
}