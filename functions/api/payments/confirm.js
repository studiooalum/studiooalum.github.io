import { buildPreviewPayment, paymentConfirmSchema } from "../../../cloudflare/lib/commerce.js";
import { hasD1, persistPayment, readOrderSyncSnapshot } from "../../../cloudflare/lib/d1.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";
import { dispatchOrderSync, getOrderSyncEventType, shouldEmailForOrderSyncEvent } from "../../../cloudflare/lib/order-sync.js";
import { canConfirmWithToss, confirmTossPayment, shouldRequirePersistence } from "../../../cloudflare/lib/toss.js";

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const payload = await readJson(context.request);
    const parsed = paymentConfirmSchema.safeParse(payload);
    const strictPersistence = shouldRequirePersistence(context.env);

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

    const payment = strictPersistence
      ? await confirmTossPayment(context.env, data)
      : canConfirmWithToss(context.env, data.paymentKey)
        ? await confirmTossPayment(context.env, data)
        : buildPreviewPayment(data);

    const warnings = [];
    let persisted = false;
    let syncTriggered = false;

    if (hasD1(context.env)) {
      try {
        persisted = await persistPayment(context.env, {
          ...payment,
          rawRequest: data,
        });
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
      try {
        const snapshot = await readOrderSyncSnapshot(context.env, payment.orderId);
        const eventType = getOrderSyncEventType(payment.status);

        if (snapshot) {
          syncTriggered = await dispatchOrderSync(context, {
            eventType,
            order: snapshot,
            meta: {
              sendEmail: shouldEmailForOrderSyncEvent(eventType),
              syncSource: "api.payments.confirm",
              providerMode: payment.providerMode || snapshot.payment?.providerMode || null,
            },
          });
        }
      } catch (error) {
        console.error("Failed to queue order sync after payment confirmation.", {
          orderId: payment.orderId,
          message: error?.message || String(error),
        });
      }
    }

    return json(context.env, {
      ok: true,
      payment: {
        ...payment,
        persisted,
      },
      syncTriggered,
      warnings,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to confirm payment.");
  }
}