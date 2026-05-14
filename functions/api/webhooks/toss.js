import { hasD1, persistWebhookEvent, readOrderSyncSnapshot } from "../../../cloudflare/lib/d1.js";
import { errorResponse, json, noContent, readJson } from "../../../cloudflare/lib/http.js";
import { dispatchOrderSync, getOrderSyncEventType, shouldEmailForOrderSyncEvent } from "../../../cloudflare/lib/order-sync.js";
import { shouldRequirePersistence } from "../../../cloudflare/lib/toss.js";

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
    const payload = await readJson(context.request);
    const deliveryId = getWebhookDeliveryId(context.request);
    const strictPersistence = shouldRequirePersistence(context.env);
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