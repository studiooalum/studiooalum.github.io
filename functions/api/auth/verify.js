import { z } from "zod";

import { createSessionCookie, verifyLoginCode } from "../../../cloudflare/lib/auth.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const verifySchema = z.object({
  mode: z.enum(["login", "signup"]).default("login"),
  email: z.string().trim().email(),
  code: z.string().trim().regex(/^\d{6}$/),
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
    const parsed = verifySchema.safeParse(payload);

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const result = await verifyLoginCode(context.env, parsed.data, context.request);

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
    return errorResponse(context.env, error, "Failed to verify the login code.");
  }
}