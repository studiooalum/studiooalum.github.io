import { z } from "zod";

import { requestLoginCode } from "../../../../cloudflare/lib/auth.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../../cloudflare/lib/http.js";

const requestSchema = z.object({
  email: z.string().trim().email(),
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

    const result = await requestLoginCode(context.env, {
      email: parsed.data.email,
      mode: "reset",
    });

    return json(context.env, {
      ok: true,
      delivery: result.delivery,
      expiresInSeconds: result.expiresInSeconds,
      debugCode: result.debugCode,
    });
  } catch (error) {
    return errorResponse(context.env, error, "비밀번호 찾기 메일을 보내지 못했습니다.");
  }
}