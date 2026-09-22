import { authorizeRepairTicketAccess } from "../../../../cloudflare/lib/repair-access.js";
import { readRepairImageForCustomer } from "../../../../cloudflare/lib/repairs.js";
import { errorResponse, json, noContent } from "../../../../cloudflare/lib/http.js";

function safeFilename(value) {
  return String(value || "repair-image").replace(/[\r\n"]/g, "").slice(0, 180) || "repair-image";
}

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    const ticketId = String(new URL(context.request.url).searchParams.get("ticket") || "").trim();
    if (!ticketId) throw Object.assign(new Error("Repair Ticket을 다시 확인해주세요."), { status: 400 });

    const access = await authorizeRepairTicketAccess(context, ticketId);
    const image = await readRepairImageForCustomer(context.env, context.params?.id);
    if (image.requestId !== access.ticket.repairId) {
      throw Object.assign(new Error("수선 이미지를 찾을 수 없습니다."), { status: 404 });
    }
    if (!context.env?.OALUM_R2) {
      return json(context.env, { ok: false, error: "이미지 저장소가 준비되지 않았습니다." }, { status: 503 });
    }

    const object = await context.env.OALUM_R2.get(image.r2Key);
    if (!object) return json(context.env, { ok: false, error: "이미지를 찾을 수 없습니다." }, { status: 404 });

    const headers = new Headers();
    headers.set("Content-Type", image.contentType || object.httpMetadata?.contentType || "application/octet-stream");
    headers.set("Cache-Control", "private, no-store");
    headers.set("Content-Disposition", `inline; filename="${safeFilename(image.filename)}"`);
    headers.set("Vary", "Authorization, Cookie, X-Guest-Access-Token, X-Repair-Ticket-Access");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(object.body, { status: 200, headers });
  } catch (error) {
    if ([401, 403, 404].includes(Number(error?.status))) {
      return json(context.env, { ok: false, error: "수선 이미지를 찾을 수 없습니다." }, { status: 404 });
    }
    return errorResponse(context.env, error, "수선 이미지를 불러오지 못했습니다.");
  }
}
