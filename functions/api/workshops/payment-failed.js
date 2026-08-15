import { z } from "zod";

import { cancelPendingWorkshopPayment } from "../../../cloudflare/lib/workshops.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const paymentFailureSchema = z.object({
  checkoutId: z.string().trim().min(1).max(100),
  orderId: z.string().trim().max(100).optional().default(""),
});

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const parsed = paymentFailureSchema.safeParse(await readJson(context.request));
    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const result = await cancelPendingWorkshopPayment(context.env, parsed.data);
    return json(context.env, { ok: true, ...result });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to release workshop payment reservation.");
  }
}