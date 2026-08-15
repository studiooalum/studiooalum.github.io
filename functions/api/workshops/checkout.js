import { z } from "zod";

import { createWorkshopCheckout } from "../../../cloudflare/lib/workshops.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const checkoutSchema = z.object({
  checkoutId: z.string().trim().min(1).max(100),
});

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const payload = await readJson(context.request);
    const parsed = checkoutSchema.safeParse(payload);
    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const checkout = await createWorkshopCheckout(context.env, parsed.data);
    return json(context.env, { ok: true, checkout });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to prepare workshop checkout.");
  }
}