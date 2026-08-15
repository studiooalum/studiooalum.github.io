import { z } from "zod";

import { confirmWorkshopPayment } from "../../../cloudflare/lib/workshops.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const paymentConfirmSchema = z.object({
  checkoutId: z.string().trim().min(1).max(100),
  paymentKey: z.string().trim().min(1).max(300),
  orderId: z.string().trim().min(1).max(100),
  amount: z.number().int().min(1).max(100000000),
});

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const payload = await readJson(context.request);
    const parsed = paymentConfirmSchema.safeParse(payload);
    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const result = await confirmWorkshopPayment(context.env, parsed.data);
    return json(context.env, { ok: true, ...result });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to confirm workshop payment.");
  }
}