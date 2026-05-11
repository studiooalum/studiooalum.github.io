import { z } from "zod";

import { lookupGuestOrder } from "../../../cloudflare/lib/auth.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const guestOrderSchema = z.object({
  orderId: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
});

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const payload = await readJson(context.request);
    const parsed = guestOrderSchema.safeParse(payload);

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const result = await lookupGuestOrder(context.env, parsed.data);

    return json(context.env, {
      ok: true,
      ...result,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to find guest order.");
  }
}