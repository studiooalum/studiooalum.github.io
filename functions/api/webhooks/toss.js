import { assertStoredOrderPayment, hasD1, persistWebhookEvent, readOrderSyncSnapshot } from "../../../cloudflare/lib/d1.js";
import { errorResponse, json, noContent, readJson } from "../../../cloudflare/lib/http.js";
import { dispatchOrderSync, getOrderSyncEventType, shouldEmailForOrderSyncEvent } from "../../../cloudflare/lib/order-sync.js";
import { readTossPayment } from "../../../cloudflare/lib/toss.js";
import { settleWorkshopPayment, refundWorkshopPayment } from "../../../cloudflare/lib/workshops.js";
import { settleRepairPayment, refundRepairPayment } from "../../../cloudflare/lib/repair-payments.js";
import { enqueueShopNotification, enqueueOrderCompletedAdminNotification } from "../../../cloudflare/lib/notifications.js";

function getWebhookDeliveryId(request) {
  return (
    request.headers.get("x-toss-delivery-id") ||
    request.headers.get("toss-delivery-id") ||
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
    const paymentKey = String(incoming?.data?.paymentKey || incoming?.paymentKey || "").trim();
    if (!paymentKey || paymentKey.length > 200) return json(context.env, { ok: false, error: "결제 정보가 없습니다." }, { status: 400 });
    const verified = await readTossPayment(context.env, paymentKey);
    if (verified?.paymentKey !== paymentKey) throw Object.assign(new Error("결제 조회 결과가 일치하지 않습니다."), { status: 409 });
    if (!["DONE", "CANCELED"].includes(verified.status)) return json(context.env, { ok: true, ignored: true });
    if (verified.status === "CANCELED" && verified.balanceAmount !== 0) throw Object.assign(new Error("취소 금액 확인이 필요합니다."), { status: 409 });
    if (verified.currency !== "KRW") throw Object.assign(new Error("지원하지 않는 결제 통화입니다."), { status: 409 });
    if (String(verified.orderId).startsWith("WSP_")) {
      const order = await context.env.OALUM_DB.prepare("SELECT * FROM workshop_payment_orders WHERE order_id = ?").bind(verified.orderId).first();
      if (!order || order.amount !== verified.totalAmount || (order.payment_key && order.payment_key !== paymentKey)) throw Object.assign(new Error("결제 정보가 일치하지 않습니다."), { status: 409 });
      if (verified.status === "DONE") await settleWorkshopPayment(context.env, { ...verified, amount: verified.totalAmount });
      else if (order.status !== "refunded") await refundWorkshopPayment(context.env, { reservationId: order.reservation_id, cancelReason: "토스 취소 내역 동기화" });
      return json(context.env, { ok: true, received: true });
    }
    if (String(verified.orderId).startsWith("RPO_")) {
      const order = await context.env.OALUM_DB.prepare("SELECT * FROM repair_payment_orders WHERE id = ?").bind(verified.orderId).first();
      if (!order || order.amount !== verified.totalAmount || (order.payment_key && order.payment_key !== paymentKey)) throw Object.assign(new Error("결제 정보가 일치하지 않습니다."), { status: 409 });
      if (verified.status === "DONE") await settleRepairPayment(context.env, { ...verified, amount: verified.totalAmount });
      else if (order.status !== "refunded") await refundRepairPayment(context.env, order.repair_id, "토스 취소 내역 동기화");
      return json(context.env, { ok: true, received: true });
    }
    await assertStoredOrderPayment(context.env, { orderId: verified.orderId, paymentKey, amount: verified.totalAmount }, { cancellation: verified.status === "CANCELED" });
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

    if (result.orderId && !result.duplicate) {
      try {
        const snapshot = await readOrderSyncSnapshot(context.env, result.orderId);
        const eventType = getOrderSyncEventType(
          payload?.status || payload?.data?.status || payload?.payment?.status,
        );

        if (snapshot) {
          await enqueueShopNotification(context.env, snapshot, verified.status === "DONE" ? "order_completed" : "refund_completed");
          if (verified.status === "DONE") await enqueueOrderCompletedAdminNotification(context.env, snapshot);
          else await enqueueShopNotification(context.env, snapshot, "refund_completed", { admin: true });
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