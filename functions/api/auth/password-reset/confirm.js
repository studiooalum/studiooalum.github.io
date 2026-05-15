import { z } from "zod";

import { resetPasswordWithCode } from "../../../../cloudflare/lib/auth.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../../cloudflare/lib/http.js";

const confirmSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().regex(/^\d{6}$/),
  password: z.string().min(8).max(200),
});

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const payload = await readJson(context.request);
    const parsed = confirmSchema.safeParse(payload);

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const result = await resetPasswordWithCode(context.env, parsed.data);

    return json(context.env, {
      ok: true,
      reset: true,
      user: result.user,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to reset password.");
  }
}