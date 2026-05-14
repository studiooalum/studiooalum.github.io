import { z } from "zod";

import { createSessionCookie, signupWithPassword } from "../../../cloudflare/lib/auth.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const signupSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
  privacyConsent: z.literal(true),
  termsConsent: z.literal(true),
  marketingConsent: z.boolean().optional().default(false),
});

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const payload = await readJson(context.request);
    const parsed = signupSchema.safeParse(payload);

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const result = await signupWithPassword(context.env, parsed.data, context.request);

    return json(context.env, {
      ok: true,
      authenticated: true,
      user: result.user,
    }, {
      headers: {
        "Set-Cookie": createSessionCookie(context.request, context.env, result.session.token),
      },
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to sign up.");
  }
}