import { paymentConfirmSchema } from "../../../cloudflare/lib/commerce.js";
import { assertStoredOrderPayment, hasD1, persistPayment, readOrderSyncSnapshot } from "../../../cloudflare/lib/d1.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";
import { enqueueOrderCompletedAdminNotification, enqueueShopNotification } from "../../../cloudflare/lib/notifications.js";
import { dispatchOrderSync, getOrderSyncEventType, shouldEmailForOrderSyncEvent } from "../../../cloudflare/lib/order-sync.js";
import { confirmTossPayment, getTossConfig } from "../../../cloudflare/lib/toss.js";
import { assertManualEditionAvailability } from '../../../cloudflare/lib/inventory.js';

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const payload = await readJson(context.request);
    const parsed = paymentConfirmSchema.safeParse(payload);
    const strictPersistence = true;

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const data = parsed.data;

    if (strictPersistence && !data.paymentKey) {
      throw Object.assign(new Error("paymentKey is required for live payment confirmation."), {
        status: 400,
      });
    }

    if (strictPersistence && !hasD1(context.env)) {
      throw Object.assign(new Error("D1 binding is required before live payments can be confirmed."), {
        status: 503,
      });
    }

    const storedOrder=await assertStoredOrderPayment(context.env, data);
    if (!storedOrder.active_payment_key && storedOrder.status!=='paid') await assertManualEditionAvailability(context.env,data.orderId);
    if (!getTossConfig(context.env).isServerReady) throw Object.assign(new Error("결제 설정이 준비되지 않았습니다."), { status: 503 });
    const claim = await context.env.OALUM_DB.prepare(`UPDATE orders SET active_payment_key = ?, updated_at = ?,
      status = CASE WHEN status = 'paid' THEN status ELSE 'payment_pending' END
      WHERE id = ? AND status NOT IN ('cancelled','refunded') AND (active_payment_key IS NULL OR active_payment_key = ?)`)
      .bind(data.paymentKey, new Date().toISOString(), data.orderId, data.paymentKey).run();
    if (!Number(claim.meta?.changes)) throw Object.assign(new Error("다른 결제 요청이 처리 중입니다. 주문 내역을 확인해주세요."), { status: 409 });
    const payment = await confirmTossPayment(context.env, data);

    const warnings = [];
    let persisted = false;
    let syncTriggered = false;
    let orderSnapshot = null;

    if (hasD1(context.env)) {
      try {
        persisted = await persistPayment(context.env, {
          ...payment,
          rawRequest: data,
        });

        if (persisted) {
          orderSnapshot = await readOrderSyncSnapshot(context.env, payment.orderId);
        }
      } catch (error) {
        if (strictPersistence) {
          throw Object.assign(new Error("Payment confirmation succeeded but D1 persistence failed."), {
            status: 502,
            details: {
              orderId: payment.orderId,
              paymentKey: payment.paymentKey,
              cause: error.message,
            },
          });
        }

        warnings.push(error.message);
      }
    }

    if (persisted) {
      const eventType = getOrderSyncEventType(payment.status);
      try {
        if (orderSnapshot) {
          syncTriggered = await dispatchOrderSync(context, {
            eventType,
            order: orderSnapshot,
            meta: {
              sendEmail: shouldEmailForOrderSyncEvent(eventType),
              syncSource: "api.payments.confirm",
              providerMode: payment.providerMode || orderSnapshot.payment?.providerMode || null,
            },
          });
        }
      } catch (error) {
        console.error("Failed to queue order sync after payment confirmation.", {
          orderId: payment.orderId,
          message: error?.message || String(error),
        });
      }

      if (orderSnapshot && eventType === "payment.confirmed") {
        await enqueueShopNotification(context.env, orderSnapshot, "order_completed");
        context.waitUntil(enqueueOrderCompletedAdminNotification(context.env, orderSnapshot).catch((error) => {
          console.error("Failed to queue paid order administrator notification.", {
            orderId: payment.orderId,
            message: error?.message || String(error),
          });
        }));
      }
    }

    return json(context.env, {
      ok: true,
      payment: { orderId: payment.orderId, orderName: payment.orderName, amount: payment.amount, status: payment.status, approvedAt: payment.approvedAt, persisted },
      order: orderSnapshot ? { orderId: orderSnapshot.orderId, totalAmount: orderSnapshot.totalAmount, status: orderSnapshot.status } : null,
      syncTriggered,
      warnings,
    });
  } catch (error) {
    if (/EDITION_UNAVAILABLE|EDITION_QUANTITY_ONE/.test(error?.message || '')) {
      return errorResponse(context.env, Object.assign(new Error('이미 판매되었거나 결제 확인 중인 에디션입니다. 각 에디션은 한 점만 구매할 수 있습니다.'), { status: 409 }));
    }
    return errorResponse(context.env, error, "Failed to confirm payment.");
  }
}
