import { z } from "zod";
import { authorizeRepairTicketAccess } from "../../../cloudflare/lib/repair-access.js";
import { refundRepairPayment } from "../../../cloudflare/lib/repair-payments.js";
import { errorResponse, json, readJson } from "../../../cloudflare/lib/http.js";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("checkout"), ticketId: z.string().min(1).max(80) }),
  z.object({ action: z.literal("confirm"), ticketId: z.string().min(1).max(80), orderId: z.string().min(1).max(100), paymentKey: z.string().min(1).max(200), amount: z.number().int().positive().max(100000000) }),
  z.object({ action: z.literal("refund"), ticketId: z.string().min(1).max(80), cancelReason: z.string().trim().min(1).max(200) }),
]);

export async function onRequestPost(context) {
  try {
    const parsed = schema.safeParse(await readJson(context.request));
    if (!parsed.success) throw Object.assign(new Error("결제 요청 정보를 확인해주세요."), { status: 400 });
    const input = parsed.data;
    if (input.action !== "refund") {
      throw Object.assign(new Error("수선 비용은 안내된 계좌로 입금해주세요."), { status: 410 });
    }
    const access = await authorizeRepairTicketAccess(context, input.ticketId);
    if (input.action === "refund") {
      if (access.viewerType !== "admin") throw Object.assign(new Error("관리자 권한이 필요합니다."), { status: 403 });
      return json(context.env, { ok: true, payment: await refundRepairPayment(context.env, access.ticket.repairId, input.cancelReason) });
    }
    throw Object.assign(new Error("지원하지 않는 수선 결제 요청입니다."), { status: 410 });
  } catch (error) { return errorResponse(context.env, error); }
}
