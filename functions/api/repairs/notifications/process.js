import { requireAdminAccess } from "../../../../cloudflare/lib/admin.js";
import { errorResponse, json, noContent } from "../../../../cloudflare/lib/http.js";
import { processNotificationOutbox } from "../../../../cloudflare/lib/notifications.js";
import { processRepairNotificationOutbox } from "../../../../cloudflare/lib/repair-notifications.js";
import { maintainWorkshopOperations } from "../../../../cloudflare/lib/workshops.js";
import { reconcileRepairPayments } from "../../../../cloudflare/lib/repair-payments.js";
import { persistPayment, readOrderSyncSnapshot } from "../../../../cloudflare/lib/d1.js";
import { readTossPayment } from "../../../../cloudflare/lib/toss.js";
import { enqueueShopNotification, enqueueOrderCompletedAdminNotification } from "../../../../cloudflare/lib/notifications.js";

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
    const workshopOperations = await maintainWorkshopOperations(context.env);
    await reconcileRepairPayments(context.env);
    const pendingOrders = await context.env.OALUM_DB.prepare("SELECT id, active_payment_key, total_amount FROM orders WHERE status = 'payment_pending' AND active_payment_key IS NOT NULL ORDER BY updated_at LIMIT 15").all();
    for (const order of pendingOrders.results || []) {
      try {
        const payment = await readTossPayment(context.env, order.active_payment_key);
        if (payment.orderId !== order.id || payment.totalAmount !== order.total_amount || payment.currency !== "KRW") continue;
        if (payment.status === "DONE") {
          await persistPayment(context.env, { ...payment, amount: payment.totalAmount, providerMode: "toss-reconciled", rawResponse: payment });
          const snapshot = await readOrderSyncSnapshot(context.env, order.id);
          await enqueueShopNotification(context.env, snapshot, "order_completed");
          await enqueueOrderCompletedAdminNotification(context.env, snapshot);
        } else if (["ABORTED", "EXPIRED"].includes(payment.status)) {
          await context.env.OALUM_DB.prepare("UPDATE orders SET active_payment_key = NULL, status = 'payment_failed', payment_status = 'failed', updated_at = ? WHERE id = ? AND status = 'payment_pending'")
            .bind(new Date().toISOString(), order.id).run();
        }
      } catch (error) { console.error("Order payment reconciliation pending", { orderId: order.id, status: error.status }); }
    }
    const processing = await processNotificationOutbox(context.env, {
      limit: 25,
      workerId: `repair-${access.method || "manual"}-${crypto.randomUUID()}`,
    });
    const legacyProcessing = await processRepairNotificationOutbox(context.env, {
      limit: 10,
      workerId: `repair-legacy-${access.method || "manual"}-${crypto.randomUUID()}`,
    });
    await context.env.OALUM_DB.prepare("DELETE FROM api_rate_limits WHERE expires_at < ?").bind(Date.now()).run();
    await context.env.OALUM_DB.prepare("DELETE FROM notification_outbox WHERE entity_type = 'workshop_inquiry' AND entity_id IN (SELECT id FROM workshop_inquiries WHERE status = 'closed' AND julianday(updated_at) < julianday('now') - 365)").run();
    await context.env.OALUM_DB.prepare("DELETE FROM workshop_inquiries WHERE status = 'closed' AND julianday(updated_at) < julianday('now') - 365").run();
    return json(context.env, { ok: true, processing, legacyProcessing, workshopOperations });
  } catch (error) {
    return errorResponse(context.env, error, "수선 안내 발송 대기열을 처리하지 못했습니다.");
  }
}