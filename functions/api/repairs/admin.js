import { z } from "zod";

import { requireAdminAccess } from "../../../cloudflare/lib/admin.js";
import { readRepairAdminSnapshot, updateRepairRequest } from "../../../cloudflare/lib/repairs.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const repairStatusSchema = z.enum([
  "received",
  "reviewing",
  "quoted",
  "approved",
  "in_progress",
  "completed",
  "rejected",
  "cancelled",
]);

const repairUpdateSchema = z.object({
  id: z.string().trim().min(1).max(80),
  status: repairStatusSchema.optional(),
  adminNote: z.string().trim().max(4000).optional(),
  customerMessage: z.string().trim().max(2000).optional(),
  quoteAmount: z.number().int().min(0).max(100000000).nullable().optional(),
  finalAmount: z.number().int().min(0).max(100000000).nullable().optional(),
}).refine((request) => (
  request.status !== undefined
  || request.adminNote !== undefined
  || request.customerMessage !== undefined
  || request.quoteAmount !== undefined
  || request.finalAmount !== undefined
), {
  message: "변경할 수선 접수 정보를 입력해주세요.",
});

const repairAdminActionSchema = z.object({
  action: z.literal("updateRepairRequest"),
  request: repairUpdateSchema,
});

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    await requireAdminAccess(context);
    const snapshot = await readRepairAdminSnapshot(context.env);
    return json(context.env, { ok: true, ...snapshot });
  } catch (error) {
    return errorResponse(context.env, error, "수선 관리 데이터를 불러오지 못했습니다.");
  }
}

export async function onRequestPost(context) {
  try {
    await requireAdminAccess(context);
    const parsed = repairAdminActionSchema.safeParse(await readJson(context.request));
    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const snapshot = await updateRepairRequest(context.env, parsed.data.request);
    return json(context.env, {
      ok: true,
      message: "수선 접수 상태를 저장했습니다.",
      ...snapshot,
    });
  } catch (error) {
    return errorResponse(context.env, error, "수선 접수 상태를 저장하지 못했습니다.");
  }
}