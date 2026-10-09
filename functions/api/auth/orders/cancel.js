import { z } from "zod";

import { requireSession } from "../../../../cloudflare/lib/auth.js";
import {verifyGuestLookupToken} from '../../../../cloudflare/lib/guest-lookup.js';
import { customerReturnState,latestReturn,requestShopReturn } from '../../../../cloudflare/lib/shop-returns.js';
import { readOrderSyncSnapshot } from "../../../../cloudflare/lib/d1.js";
import {
  getCustomerOrderCancellationState,
  processOrderCancellation,
} from "../../../../cloudflare/lib/order-cancellation.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../../cloudflare/lib/http.js";

const cancelSchema = z.object({
  orderId: z.string().trim().min(1).max(80),
  reason: z.string().trim().max(400).optional().default(""),
  reasonCode: z.enum(['change_of_mind','size','defect','wrong_item','other']).optional(),
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
    const payload = await readJson(context.request);
    const parsed = cancelSchema.safeParse(payload);

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }
    const guestToken=context.request.headers.get('X-Guest-Access-Token');
    const session=guestToken ? null : await requireSession(context.env,context.request);
    if(guestToken) await verifyGuestLookupToken(context.env,guestToken,{resourceType:'order',resourceId:parsed.data.orderId});

    const order = await readOrderSyncSnapshot(context.env, parsed.data.orderId);
    if (!order) {
      throw Object.assign(new Error("주문 정보를 찾을 수 없습니다."), {
        status: 404,
      });
    }

    if(session) ensureOrderAccess(session, order);

    const returnState=customerReturnState(order,await latestReturn(context.env.OALUM_DB,order.orderId));
    if(returnState) {
      const request=returnState.available ? await requestShopReturn(context,{order,reasonCode:parsed.data.reasonCode,reasonNote:parsed.data.reason}) : returnState.request;
      return json(context.env,{ok:true,action:'approval_requested',request,message:'반품·환불 요청 상태는 주문 내역에서 확인할 수 있습니다. 관리자 확인 후 이메일로 안내드립니다.'});
    }

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

    throw Object.assign(new Error(cancellation.message || "현재 단계에서는 주문 취소를 진행할 수 없습니다."), {
      status: 409,
    });
  } catch (error) {
    return errorResponse(context.env, error, "주문 취소를 처리하지 못했습니다.");
  }
}
