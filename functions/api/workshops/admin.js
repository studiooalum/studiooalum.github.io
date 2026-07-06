import { z } from "zod";

import { requireAdminAccess } from "../../../cloudflare/lib/admin.js";
import {
  createWorkshopDateBlock,
  deleteWorkshopDateBlock,
  readWorkshopAdminSnapshot,
  updateWorkshopReservationStatus,
} from "../../../cloudflare/lib/workshops.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const workshopAdminActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("cancelReservation"),
    reservationId: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal("restoreReservation"),
    reservationId: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal("blockDate"),
    workshopSlug: z.string().trim().min(1).max(120),
    workshopTitle: z.string().trim().max(160).optional().default(""),
    slotDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().trim().max(200).optional().default("예약 불가 일정입니다."),
  }),
  z.object({
    action: z.literal("unblockDate"),
    blockId: z.string().trim().min(1).max(80),
  }),
]);

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    await requireAdminAccess(context);

    const url = new URL(context.request.url);
    const query = String(url.searchParams.get("query") || "").trim();
    const status = String(url.searchParams.get("status") || "all").trim();
    const limit = Number(url.searchParams.get("limit") || 40);
    const snapshot = await readWorkshopAdminSnapshot(context.env, { query, status, limit });

    return json(context.env, {
      ok: true,
      ...snapshot,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to load workshop admin data.");
  }
}

export async function onRequestPost(context) {
  try {
    await requireAdminAccess(context);

    const payload = await readJson(context.request);
    const parsed = workshopAdminActionSchema.safeParse(payload);

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const data = parsed.data;
    let resultMessage = "";

    if (data.action === "cancelReservation") {
      await updateWorkshopReservationStatus(context.env, {
        reservationId: data.reservationId,
        status: "cancelled",
      });
      resultMessage = "예약을 취소 상태로 변경했습니다.";
    } else if (data.action === "restoreReservation") {
      await updateWorkshopReservationStatus(context.env, {
        reservationId: data.reservationId,
        status: "confirmed",
      });
      resultMessage = "예약을 다시 확정 상태로 되돌렸습니다.";
    } else if (data.action === "blockDate") {
      await createWorkshopDateBlock(context.env, data);
      resultMessage = "해당 날짜를 예약 불가로 등록했습니다.";
    } else if (data.action === "unblockDate") {
      await deleteWorkshopDateBlock(context.env, {
        blockId: data.blockId,
      });
      resultMessage = "차단 일정을 해제했습니다.";
    }

    const snapshot = await readWorkshopAdminSnapshot(context.env, {
      query: "",
      status: "all",
      limit: 40,
    });

    return json(context.env, {
      ok: true,
      message: resultMessage,
      ...snapshot,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to update workshop admin data.");
  }
}