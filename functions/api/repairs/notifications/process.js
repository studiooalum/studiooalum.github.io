import { requireAdminAccess } from "../../../../cloudflare/lib/admin.js";
import { errorResponse, json, noContent } from "../../../../cloudflare/lib/http.js";
import { processRepairNotificationOutbox } from "../../../../cloudflare/lib/repair-notifications.js";

function readBearerToken(request) {
  const authorization = String(request.headers.get("Authorization") || "").trim();
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || ""))));
}

async function constantTimeEqual(left, right) {
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)]);
  let mismatch = 0;
  for (let index = 0; index < leftHash.length; index += 1) {
    mismatch |= leftHash[index] ^ rightHash[index];
  }
  return mismatch === 0;
}

async function authorizeProcessor(context) {
  const cronSecret = String(context.env?.REPAIR_NOTIFICATION_CRON_SECRET || "").trim();
  const bearerToken = readBearerToken(context.request);
  if (cronSecret && bearerToken && await constantTimeEqual(cronSecret, bearerToken)) {
    return { method: "cron" };
  }
  return requireAdminAccess(context);
}

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const access = await authorizeProcessor(context);
    const processing = await processRepairNotificationOutbox(context.env, {
      limit: 25,
      workerId: `repair-${access.method || "manual"}-${crypto.randomUUID()}`,
    });
    return json(context.env, { ok: true, processing });
  } catch (error) {
    return errorResponse(context.env, error, "수선 안내 발송 대기열을 처리하지 못했습니다.");
  }
}