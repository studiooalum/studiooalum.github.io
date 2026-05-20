import { z } from "zod";

import { readAccount, requireSession, updateAccount } from "../../../cloudflare/lib/auth.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const updateSchema = z.object({
  fullName: z.string().trim().max(120).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  zipcode: z.string().trim().max(20).optional().default(""),
  address1: z.string().trim().max(200).optional().default(""),
  address2: z.string().trim().max(200).optional().default(""),
});

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    const session = await requireSession(context.env, context.request);
    const account = await readAccount(context.env, session.user.id);

    return json(context.env, {
      ok: true,
      authenticated: true,
      account,
    });
  } catch (error) {
    return errorResponse(context.env, error, "계정 정보를 불러오지 못했습니다.");
  }
}

export async function onRequestPost(context) {
  try {
    const session = await requireSession(context.env, context.request);
    const payload = await readJson(context.request);
    const parsed = updateSchema.safeParse(payload);

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const account = await updateAccount(context.env, session.user.id, parsed.data);

    return json(context.env, {
      ok: true,
      authenticated: true,
      account,
    });
  } catch (error) {
    return errorResponse(context.env, error, "계정 정보를 저장하지 못했습니다.");
  }
}