import { z } from "zod";

import { authorizeRepairCustomerAccess } from "../../../cloudflare/lib/repair-access.js";
import { createRepairCustomerInquiry, readRepairRequestForCustomer } from "../../../cloudflare/lib/repairs.js";
import { processRepairNotificationOutbox } from "../../../cloudflare/lib/repair-notifications.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const inquirySchema = z.object({
  requestId: z.string().trim().min(1).max(80),
  inquiryId: z.string().trim().min(16).max(80).regex(/^[A-Za-z0-9._:-]+$/),
  message: z.string().trim().min(1, "문의 내용을 입력해주세요.").max(2000),
});

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    const requestId = String(new URL(context.request.url).searchParams.get("id") || "").trim();
    const access = await authorizeRepairCustomerAccess(context, requestId);
    return json(context.env, { ok: true, repair: access.request });
  } catch (error) {
    return errorResponse(context.env, error, "수선 내역을 불러오지 못했습니다.");
  }
}

export async function onRequestPost(context) {
  try {
    const parsed = inquirySchema.safeParse(await readJson(context.request));
    if (!parsed.success) return validationError(context.env, parsed.error);
    const access = await authorizeRepairCustomerAccess(context, parsed.data.requestId);
    const inquiry = await createRepairCustomerInquiry(context.env, parsed.data, access.actor);
    if (inquiry.notificationIds.length && typeof context.waitUntil === "function") {
      context.waitUntil(processRepairNotificationOutbox(context.env, { ids: inquiry.notificationIds }).catch((error) => {
        console.error("Failed to process Repair inquiry notification.", error);
      }));
    }
    return json(context.env, {
      ok: true,
      duplicate: inquiry.duplicate,
      message: inquiry.duplicate ? "이미 등록된 문의입니다." : "문의를 등록했습니다.",
      notificationStatus: inquiry.notificationIds.length ? "queued" : "not_created",
      repair: await readRepairRequestForCustomer(context.env, parsed.data.requestId),
    }, { status: inquiry.duplicate ? 200 : 201 });
  } catch (error) {
    return errorResponse(context.env, error, "문의를 등록하지 못했습니다.");
  }
}