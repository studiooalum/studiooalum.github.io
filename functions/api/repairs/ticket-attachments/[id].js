import { authorizeRepairTicketAccess } from "../../../../cloudflare/lib/repair-access.js";
import { readRepairTicketAttachment } from "../../../../cloudflare/lib/repair-tickets.js";
import { errorResponse, json, noContent } from "../../../../cloudflare/lib/http.js";

function safeFilename(value) {
  return String(value || "ticket-image").replace(/[\r\n"]/g, "").slice(0, 180) || "ticket-image";
}

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    const attachment = await readRepairTicketAttachment(context.env, context.params?.id);
    await authorizeRepairTicketAccess(context, attachment.ticketId);
    if (!context.env?.OALUM_R2) return json(context.env, { ok: false, error: "이미지 저장소가 준비되지 않았습니다." }, { status: 503 });
    const object = await context.env.OALUM_R2.get(attachment.r2Key);
    if (!object) return json(context.env, { ok: false, error: "첨부 이미지를 찾을 수 없습니다." }, { status: 404 });
    const headers = new Headers();
    headers.set("Content-Type", attachment.contentType || object.httpMetadata?.contentType || "application/octet-stream");
    headers.set("Cache-Control", "private, no-store");
    headers.set("Content-Disposition", `inline; filename="${safeFilename(attachment.filename)}"`);
    headers.set("Vary", "Authorization, Cookie, X-Guest-Access-Token");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(object.body, { status: 200, headers });
  } catch (error) {
    if ([401, 403, 404].includes(Number(error?.status))) {
      return json(context.env, { ok: false, error: "첨부 이미지를 찾을 수 없습니다." }, { status: 404 });
    }
    return errorResponse(context.env, error, "첨부 이미지를 불러오지 못했습니다.");
  }
}