import { z } from "zod";

import { requestLoginCode } from "../../../cloudflare/lib/auth.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const requestSchema = z.object({
  email: z.string().trim().email(),
  fullName: z.string().trim().max(120).optional(),
});

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const payload = await readJson(context.request);
    const parsed = requestSchema.safeParse(payload);

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const result = await requestLoginCode(context.env, parsed.data.email);

    return json(context.env, {
      ok: true,
      delivery: result.delivery,
      expiresInSeconds: result.expiresInSeconds,
      debugCode: result.debugCode,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to request a login code.");
  }
}