import { z } from "zod";

import { requireSession } from "../../../../cloudflare/lib/auth.js";
import { readOrderSyncSnapshot } from "../../../../cloudflare/lib/d1.js";
import {
  getCustomerOrderCancellationState,
  processOrderCancellation,
  requestOrderCancellationApproval,
} from "../../../../cloudflare/lib/order-cancellation.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../../cloudflare/lib/http.js";

const cancelSchema = z.object({
  orderId: z.string().trim().min(1).max(80),
  reason: z.string().trim().max(400).optional().default(""),
});

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function ensureOrderAccess(session, order) {
  const sessionUserId = String(session?.user?.id || "").trim();
  const sessionEmail = normalizeEmail(session?.user?.email);
  const orderUserId = String(order?.userId || "").trim();
  const orderEmail = normalizeEmail(order?.customer?.email);

  if (sessionUserId && orderUserId && sessionUserId === orderUserId) {
    return true;
  }

  if (sessionEmail && orderEmail && sessionEmail === orderEmail) {
    return true;
  }

  throw Object.assign(new Error("해당 주문에 접근할 수 없습니다."), {
    status: 403,
  });
}

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const session = await requireSession(context.env, context.request);
    const payload = await readJson(context.request);
    const parsed = cancelSchema.safeParse(payload);

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const order = await readOrderSyncSnapshot(context.env, parsed.data.orderId);
    if (!order) {
      throw Object.assign(new Error("주문 정보를 찾을 수 없습니다."), {
        status: 404,
      });
    }

    ensureOrderAccess(session, order);

    const cancellation = getCustomerOrderCancellationState(order);

    if (cancellation.status === "completed") {
      return json(context.env, {
        ok: true,
        action: "already_cancelled",
        order,
        message: "이미 취소 또는 환불 처리된 주문입니다.",
      });
    }

    if (cancellation.action === "direct_cancel") {
      const result = await processOrderCancellation(context, {
        order,
        reason: parsed.data.reason || "고객이 계정 페이지에서 주문 취소를 요청했습니다.",
        source: "customer-account",
        providerMode: "customer-account-cancellation",
      });

      return json(context.env, {
        ok: true,
        action: "cancelled",
        order: result.order,
        payment: result.payment,
        syncTriggered: result.syncTriggered,
        message: result.alreadyCancelled
          ? "이미 취소 완료된 주문입니다."
          : "주문 취소와 토스 환불 처리가 완료되었습니다.",
      });
    }

    if (cancellation.action === "request_approval") {
      const result = await requestOrderCancellationApproval(context, {
        order,
        user: session.user,
        reason: parsed.data.reason || "고객이 배송 준비 단계 주문 취소를 요청했습니다.",
      });

      return json(context.env, {
        ok: true,
        action: "approval_requested",
        request: result.request,
        created: result.created,
        mailed: result.mailed,
        message: result.created
          ? "판매자 승인 요청을 보냈습니다. 승인되면 자동으로 주문 취소와 환불이 진행됩니다."
          : "이미 판매자 승인 대기 중인 취소 요청이 있습니다.",
      });
    }

    throw Object.assign(new Error(cancellation.message || "현재 단계에서는 주문 취소를 진행할 수 없습니다."), {
      status: 409,
    });
  } catch (error) {
    return errorResponse(context.env, error, "주문 취소를 처리하지 못했습니다.");
  }
}