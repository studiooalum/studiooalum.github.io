import {
  buildOrderName,
  computeOrderAmount,
  createOrderSchema,
  generateOrderId,
  normalizeOrderItems,
} from "../../cloudflare/lib/commerce.js";
import { readSession, updateAccount } from "../../cloudflare/lib/auth.js";
import { hasD1, persistOrder, readOrderSyncSnapshot } from "../../cloudflare/lib/d1.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../cloudflare/lib/http.js";
import { dispatchOrderSync } from "../../cloudflare/lib/order-sync.js";
import { shouldRequirePersistence } from "../../cloudflare/lib/toss.js";

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const payload = await readJson(context.request);
    const parsed = createOrderSchema.safeParse(payload);
    const strictPersistence = shouldRequirePersistence(context.env);
    const session = await readSession(context.env, context.request, { touch: false });

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    if (strictPersistence && !hasD1(context.env)) {
      throw Object.assign(new Error("D1 binding is required before live orders can be created."), {
        status: 503,
      });
    }

    const items = normalizeOrderItems(parsed.data.items);
    const total = computeOrderAmount(items);
    const order = {
      orderId: generateOrderId(),
      userId: session?.user?.id || null,
      orderName: buildOrderName(items),
      total,
      items,
      shipping: parsed.data.shipping,
      createdAt: parsed.data.createdAt || new Date().toISOString(),
      status: "created",
      paymentStatus: "pending",
    };

    const warnings = [];
    let persisted = false;
    let syncTriggered = false;

    if (hasD1(context.env)) {
      try {
        persisted = await persistOrder(context.env, order);

        if (session?.user?.id && parsed.data.saveAsDefaultAddress) {
          await updateAccount(context.env, session.user.id, {
            fullName: parsed.data.shipping.name,
            phone: parsed.data.shipping.phone,
            zipcode: parsed.data.shipping.zipcode,
            address1: parsed.data.shipping.address1,
            address2: parsed.data.shipping.address2 || "",
          });
        }
      } catch (error) {
        if (strictPersistence) {
          throw Object.assign(new Error("Order was created but could not be persisted to D1."), {
            status: 502,
            details: {
              orderId: order.orderId,
              cause: error.message,
            },
          });
        }

        warnings.push(error.message);
      }
    }

    if (persisted) {
      try {
        const snapshot = await readOrderSyncSnapshot(context.env, order.orderId);
        if (snapshot) {
          syncTriggered = await dispatchOrderSync(context, {
            eventType: "order.created",
            order: snapshot,
            meta: {
              sendEmail: false,
              syncSource: "api.orders",
            },
          });
        }
      } catch (error) {
        console.error("Failed to queue order sync after order creation.", {
          orderId: order.orderId,
          message: error?.message || String(error),
        });
      }
    }

    return json(context.env, {
      ok: true,
      order: {
        ...order,
        providerMode: persisted ? "d1-persisted" : "preview-no-db",
        persisted,
        memberOrder: Boolean(order.userId),
      },
      syncTriggered,
      warnings,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to create order.");
  }
}