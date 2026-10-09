import { assertStoredOrderPayment, hasD1, persistWebhookEvent, readOrderSyncSnapshot } from "../../../cloudflare/lib/d1.js";
import { errorResponse, json, noContent, readJson } from "../../../cloudflare/lib/http.js";
import { dispatchOrderSync, getOrderSyncEventType, shouldEmailForOrderSyncEvent } from "../../../cloudflare/lib/order-sync.js";
import { readTossPayment } from "../../../cloudflare/lib/toss.js";
import { settleShopReturn } from '../../../cloudflare/lib/shop-returns.js';
import { settleWorkshopPayment, settleWorkshopRefund } from "../../../cloudflare/lib/workshops.js";
import { settleRepairPayment, refundRepairPayment } from "../../../cloudflare/lib/repair-payments.js";
import { enqueueShopNotification, enqueueOrderCompletedAdminNotification, enqueueNotification, resolveNotificationAdminRecipient } from "../../../cloudflare/lib/notifications.js";

async function recordPartialRefund(env, payment, { entityType = "order", entityId = payment.orderId, adminPath = "/admin" } = {}) {
  if (!Number.isSafeInteger(payment.balanceAmount) || payment.balanceAmount <= 0 || payment.balanceAmount >= payment.totalAmount) {
    throw Object.assign(new Error("부분 취소 금액 확인이 필요합니다."), { status: 409 });
  }
  const eventKey = `toss:partial:${payment.orderId}:${payment.balanceAmount}`;
  const now = new Date().toISOString();
  await env.OALUM_DB.prepare(`INSERT OR IGNORE INTO payment_events
    (order_id, provider, event_type, delivery_id, payload, received_at, processed_at)
    VALUES (?, 'toss', 'payment.partial_refund_review', ?, ?, ?, ?)`)
    .bind(entityType === "order" ? payment.orderId : null, eventKey, JSON.stringify(payment), now, now).run();
  // Stable outbox keys make a retried event recover a failed notification write.
  await enqueueNotification(env, {
    eventKey, entityType, entityId, channel: "email", templateKey: "shop.payment_review_required_admin",
    recipient: resolveNotificationAdminRecipient(env),
    payload: { order_number: payment.orderId, final_amount: `${payment.balanceAmount.toLocaleString("ko-KR")}원`,
      order_url: new URL(adminPath, env.PUBLIC_SITE_URL || "https://studiooalum.com").href },
  });
}

function getWebhookDeliveryId(request) {
  return (
    request.headers.get("x-toss-delivery-id") ||
    request.headers.get("toss-delivery-id") ||
    request.headers.get("tosspayments-webhook-transmission-id") ||
    request.headers.get("x-webhook-id") ||
    request.headers.get("webhook-id") ||
    null
  );
}

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const incoming = await readJson(context.request);
    if (incoming.eventType && incoming.eventType !== "PAYMENT_STATUS_CHANGED") return json(context.env, { ok: true, ignored: true });
    if (!hasD1(context.env)) throw Object.assign(new Error("결제 저장소가 준비되지 않았습니다."), { status: 503 });
    const paymentKey = String(incoming?.data?.paymentKey || incoming?.paymentKey || "").trim();
    if (!paymentKey || paymentKey.length > 200) return json(context.env, { ok: false, error: "결제 정보가 없습니다." }, { status: 400 });
    const verified = await readTossPayment(context.env, paymentKey, { timeoutMs: 6000 });
    if (verified?.paymentKey !== paymentKey) throw Object.assign(new Error("결제 조회 결과가 일치하지 않습니다."), { status: 409 });
    if (!["DONE", "CANCELED", "PARTIAL_CANCELED", "ABORTED", "EXPIRED"].includes(verified.status)) return json(context.env, { ok: true, ignored: true });
    if (verified.status === "CANCELED" && verified.balanceAmount !== 0) throw Object.assign(new Error("취소 금액 확인이 필요합니다."), { status: 409 });
    if (verified.currency !== "KRW") throw Object.assign(new Error("지원하지 않는 결제 통화입니다."), { status: 409 });
    if (verified.status === "DONE" && !verified.approvedAt) throw Object.assign(new Error("결제 승인 시각이 없습니다."), { status: 409 });
    const isTerminalFailure = ["ABORTED", "EXPIRED"].includes(verified.status);
    if (String(verified.orderId).startsWith("WSP_")) {
      if (isTerminalFailure) return json(context.env, { ok: true, ignored: true });
      const order = await context.env.OALUM_DB.prepare("SELECT * FROM workshop_payment_orders WHERE order_id = ?").bind(verified.orderId).first();
      if (!order || order.amount !== verified.totalAmount || (order.payment_key && order.payment_key !== paymentKey)) throw Object.assign(new Error("결제 정보가 일치하지 않습니다."), { status: 409 });
      if (verified.status === "PARTIAL_CANCELED") {
        await recordPartialRefund(context.env, verified, { entityType: "workshop", entityId: order.reservation_id, adminPath: "/workshop-admin" });
        return json(context.env, { ok: true, reviewRequired: true });
      }
      if (verified.status === "DONE") await settleWorkshopPayment(context.env, { ...verified, amount: verified.totalAmount });
      else await settleWorkshopRefund(context.env, verified);
      return json(context.env, { ok: true, received: true });
    }
    if (String(verified.orderId).startsWith("RPO_")) {
      if (isTerminalFailure) return json(context.env, { ok: true, ignored: true });
      const order = await context.env.OALUM_DB.prepare("SELECT * FROM repair_payment_orders WHERE id = ?").bind(verified.orderId).first();
      if (!order || order.amount !== verified.totalAmount || (order.payment_key && order.payment_key !== paymentKey)) throw Object.assign(new Error("결제 정보가 일치하지 않습니다."), { status: 409 });
      if (verified.status === "PARTIAL_CANCELED") {
        await recordPartialRefund(context.env, verified, { entityType: "repair", entityId: order.repair_id, adminPath: "/repair-admin" });
        return json(context.env, { ok: true, reviewRequired: true });
      }
      if (verified.status === "DONE") await settleRepairPayment(context.env, { ...verified, amount: verified.totalAmount });
      else if (order.status !== "refunded") await refundRepairPayment(context.env, order.repair_id, "토스 취소 내역 동기화");
      return json(context.env, { ok: true, received: true });
    }
    await assertStoredOrderPayment(context.env, { orderId: verified.orderId, paymentKey, amount: verified.totalAmount }, { cancellation: ["CANCELED", "PARTIAL_CANCELED"].includes(verified.status) });
    if (['CANCELED','PARTIAL_CANCELED'].includes(verified.status) && await settleShopReturn(context.env,verified)) return json(context.env,{ok:true,received:true,returnCompleted:true});
    if (verified.status === "PARTIAL_CANCELED") {
      await recordPartialRefund(context.env, verified);
    }
    const payload = { eventType: "PAYMENT_STATUS_CHANGED", data: verified };
    const deliveryId = getWebhookDeliveryId(context.request);
    const strictPersistence = true;
    const warnings = [];
    let result = {
      persisted: false,
      duplicate: false,
      orderUpdated: false,
      paymentUpdated: false,
    };
    let syncTriggered = false;

    if (strictPersistence && !hasD1(context.env)) {
      throw Object.assign(new Error("D1 binding is required before Toss webhooks can be processed."), {
        status: 503,
      });
    }

    if (hasD1(context.env)) {
      try {
        result = await persistWebhookEvent(context.env, payload, {
          deliveryId,
        });
        if (verified.status === "CANCELED") {
          await context.env.OALUM_DB.prepare("UPDATE shipments SET status = 'cancelled', updated_at = ? WHERE order_id = ? AND status IN ('confirmed','ready','packing')")
            .bind(new Date().toISOString(), verified.orderId).run();
        }
      } catch (error) {
        if (strictPersistence) {
          throw Object.assign(new Error("Toss webhook was received but could not be persisted to D1."), {
            status: 502,
            details: {
              cause: error.message,
            },
          });
        }

        warnings.push(error.message);
      }
    }

    // Outbox event keys deduplicate delivery. Retry even when the payment event
    // was already saved, since a previous outbox write may have failed.
    if (result.orderId) {
      try {
        const snapshot = await readOrderSyncSnapshot(context.env, result.orderId);
        const eventType = getOrderSyncEventType(
          payload?.status || payload?.data?.status || payload?.payment?.status,
        );

        if (snapshot) {
          if (verified.status === "DONE") {
            await enqueueShopNotification(context.env, snapshot, "order_completed");
            await enqueueOrderCompletedAdminNotification(context.env, snapshot);
          } else if (verified.status === "CANCELED") {
            await enqueueShopNotification(context.env, snapshot, "order_cancelled");
            await enqueueShopNotification(context.env, snapshot, "refund_completed", { admin: true });
          }
          syncTriggered = await dispatchOrderSync(context, {
            eventType,
            order: snapshot,
            meta: {
              sendEmail: shouldEmailForOrderSyncEvent(eventType),
              syncSource: "api.webhooks.toss",
              deliveryId,
              duplicate: result.duplicate,
              providerMode: snapshot.payment?.providerMode || "toss-webhook",
            },
          });
        }
      } catch (error) {
        console.error("Failed to queue order sync after Toss webhook.", {
          orderId: result.orderId,
          message: error?.message || String(error),
        });
        throw error;
      }
    }

    return json(context.env, {
      ok: true,
      received: true,
      persisted: result.persisted,
      duplicate: result.duplicate,
      orderUpdated: result.orderUpdated,
      paymentUpdated: result.paymentUpdated,
      syncTriggered,
      warnings,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to process Toss webhook.");
  }
}
