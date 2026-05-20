import { z } from "zod";

import { createSessionCookie, loginWithPassword } from "../../../cloudflare/lib/auth.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
});

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const payload = await readJson(context.request);
    const parsed = loginSchema.safeParse(payload);

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const result = await loginWithPassword(context.env, parsed.data, context.request);

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
    return errorResponse(context.env, error, "로그인을 진행하지 못했습니다.");
  }
}