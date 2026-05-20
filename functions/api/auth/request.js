import { z } from "zod";

import { requestLoginCode } from "../../../cloudflare/lib/auth.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const requestSchema = z.object({
  mode: z.enum(["login", "signup"]).default("login"),
  email: z.string().trim().email(),
  fullName: z.string().trim().max(120).optional().default(""),
}).superRefine((value, context) => {
  if (value.mode === "signup" && !value.fullName) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fullName"],
      message: "회원가입에는 이름이 필요합니다.",
    });
  }
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

    const result = await requestLoginCode(context.env, parsed.data);

    return json(context.env, {
      ok: true,
      delivery: result.delivery,
      expiresInSeconds: result.expiresInSeconds,
      debugCode: result.debugCode,
    });
  } catch (error) {
    return errorResponse(context.env, error, "인증코드를 요청하지 못했습니다.");
  }
}