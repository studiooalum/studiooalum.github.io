import { z } from "zod";

import { requireAdminAccess } from "../../../cloudflare/lib/admin.js";
import { refundWorkshopPayment } from "../../../cloudflare/lib/workshops.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const paymentCancelSchema = z.object({
  reservationId: z.string().trim().min(1).max(80),
  cancelReason: z.string().trim().max(200).optional().default("관리자 요청으로 워크숍 결제를 취소했습니다."),
});

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    await requireAdminAccess(context);
    const payload = await readJson(context.request);
    const parsed = paymentCancelSchema.safeParse(payload);
    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const result = await refundWorkshopPayment(context.env, parsed.data);
    return json(context.env, { ok: true, ...result });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to cancel workshop payment.");
  }
}