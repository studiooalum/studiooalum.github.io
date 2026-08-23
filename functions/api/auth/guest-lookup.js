import { z } from "zod";

import { lookupGuestResource } from "../../../cloudflare/lib/guest-lookup.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const guestLookupSchema = z.object({
  reference: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(320),
});

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const parsed = guestLookupSchema.safeParse(await readJson(context.request));
    if (!parsed.success) return validationError(context.env, parsed.error);
    const result = await lookupGuestResource(context.env, context.request, parsed.data);
    return json(context.env, { ok: true, ...result });
  } catch (error) {
    if (Number(error?.status) === 404) {
      return json(context.env, {
        ok: false,
        error: "입력한 정보와 일치하는 신청 내역을 찾을 수 없습니다.",
      }, { status: 404 });
    }
    return errorResponse(context.env, error, "신청 내역을 조회하지 못했습니다.");
  }
}