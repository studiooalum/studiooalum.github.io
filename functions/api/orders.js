import {
  buildOrderName,
  computeOrderAmount,
  createOrderSchema,
  generateOrderId,
  normalizeOrderItems,
} from "../../cloudflare/lib/commerce.js";
import { hasD1, persistOrder } from "../../cloudflare/lib/d1.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../cloudflare/lib/http.js";

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const payload = await readJson(context.request);
    const parsed = createOrderSchema.safeParse(payload);

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const items = normalizeOrderItems(parsed.data.items);
    const total = computeOrderAmount(items);
    const order = {
      orderId: generateOrderId(),
      orderName: buildOrderName(items),
      total,
      items,
      shipping: parsed.data.shipping,
      createdAt: parsed.data.createdAt || new Date().toISOString(),
      status: "pending",
      paymentStatus: "ready",
    };

    const warnings = [];
    let persisted = false;

    if (hasD1(context.env)) {
      try {
        persisted = await persistOrder(context.env, order);
      } catch (error) {
        warnings.push(error.message);
      }
    }

    return json(context.env, {
      ok: true,
      order: {
        ...order,
        providerMode: persisted ? "d1-persisted" : "preview-no-db",
        persisted,
      },
      warnings,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to create order.");
  }
}