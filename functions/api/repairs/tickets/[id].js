import { authorizeRepairTicketAccess } from "../../../../cloudflare/lib/repair-access.js";
import {
  createRepairTicketAttachmentId,
  createRepairTicketMessage,
  markRepairTicketRead,
  readRepairTicketById,
} from "../../../../cloudflare/lib/repair-tickets.js";
import { processNotificationOutbox } from "../../../../cloudflare/lib/notifications.js";
import { buildRepairTicketAttachmentKey } from "../../../../cloudflare/lib/r2.js";
import { errorResponse, json, noContent } from "../../../../cloudflare/lib/http.js";

const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const CLIENT_MESSAGE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,119}$/;

function selectedFiles(formData) {
  return formData.getAll("attachments").filter((value) => value && typeof value !== "string" && Number(value.size || 0) > 0);
}

function validateFiles(files) {
  if (files.length > MAX_ATTACHMENTS) throw Object.assign(new Error(`사진은 최대 ${MAX_ATTACHMENTS}장까지 첨부할 수 있습니다.`), { status: 400 });
  for (const file of files) {
    if (!ALLOWED_TYPES.has(String(file.type || "").toLowerCase())) {
      throw Object.assign(new Error("JPG, PNG, WEBP, AVIF 이미지만 첨부할 수 있습니다."), { status: 400 });
    }
    if (Number(file.size || 0) > MAX_ATTACHMENT_SIZE) {
      throw Object.assign(new Error("각 사진은 8MB 이하로 첨부해주세요."), { status: 400 });
    }
  }
}

async function clientKey(request, ticketId, actorType) {
  const ip = String(request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0] || "unknown").trim();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ticketId}|${actorType}|${ip}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function removeUploads(bucket, attachments) {
  if (!bucket || !attachments.length) return;
  await Promise.allSettled(attachments.map((attachment) => bucket.delete(attachment.r2Key)));
}

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    const access = await authorizeRepairTicketAccess(context, context.params?.id);
    await markRepairTicketRead(context.env, access.ticket.id, access.viewerType);
    const current = await readRepairTicketById(context.env, access.ticket.id);
    return json(context.env, { ok: true, viewerType: access.viewerType, ticket: current.ticket });
  } catch (error) {
    if ([401, 403, 404].includes(Number(error?.status))) {
      return json(context.env, { ok: false, error: "Repair Ticket을 찾을 수 없습니다." }, { status: 404 });
    }
    return errorResponse(context.env, error, "Repair Ticket을 불러오지 못했습니다.");
  }
}

export async function onRequestPost(context) {
  const uploaded = [];
  let bucket = null;
  try {
    const access = await authorizeRepairTicketAccess(context, context.params?.id);
    const contentType = String(context.request.headers.get("Content-Type") || "").toLowerCase();
    if (!contentType.includes("multipart/form-data")) {
      return json(context.env, { ok: false, error: "메시지 형식을 다시 확인해주세요." }, { status: 400 });
    }
    const formData = await context.request.formData();
    const clientMessageId = String(context.request.headers.get("Idempotency-Key") || formData.get("client_message_id") || "").trim();
    if (!CLIENT_MESSAGE_PATTERN.test(clientMessageId)) {
      return json(context.env, { ok: false, error: "메시지 요청 키를 다시 확인해주세요." }, { status: 400 });
    }
    const files = selectedFiles(formData);
    validateFiles(files);
    if (files.length) {
      if (!context.env?.OALUM_R2) throw Object.assign(new Error("이미지 저장소가 준비되지 않았습니다."), { status: 503 });
      bucket = context.env.OALUM_R2;
    }
    const messageId = `RTM_${crypto.randomUUID().replace(/-/g, "").toUpperCase()}`;
    for (const [sortOrder, file] of files.entries()) {
      const id = createRepairTicketAttachmentId();
      const r2Key = buildRepairTicketAttachmentKey({
        ticketId: access.ticket.id,
        messageId,
        attachmentId: id,
        fileName: file.name,
        fileType: file.type,
      });
      await bucket.put(r2Key, file.stream(), {
        httpMetadata: { contentType: file.type, cacheControl: "private, no-store" },
        customMetadata: { ticketId: access.ticket.id, messageId, attachmentId: id },
      });
      uploaded.push({ id, r2Key, filename: file.name, contentType: file.type, byteSize: Number(file.size || 0), sortOrder });
    }
    const result = await createRepairTicketMessage(context.env, {
      ticketId: access.ticket.id,
      clientMessageId,
      body: String(formData.get("body") || ""),
      authorType: access.viewerType === "admin" ? "admin" : "customer",
      clientKey: await clientKey(context.request, access.ticket.id, access.viewerType),
      messageId,
    }, uploaded);
    if (result.duplicate) await removeUploads(bucket, uploaded);
    if (result.notificationIds.length && typeof context.waitUntil === "function") {
      context.waitUntil(processNotificationOutbox(context.env, { ids: result.notificationIds }).catch((error) => {
        console.error("Failed to process Repair Ticket notification.", error);
      }));
    }
    const current = await readRepairTicketById(context.env, access.ticket.id);
    return json(context.env, { ok: true, duplicate: result.duplicate, viewerType: access.viewerType, ticket: current.ticket }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    await removeUploads(bucket, uploaded);
    if ([401, 403, 404].includes(Number(error?.status))) {
      return json(context.env, { ok: false, error: "Repair Ticket을 찾을 수 없습니다." }, { status: 404 });
    }
    return errorResponse(context.env, error, "Repair Ticket 메시지를 등록하지 못했습니다.");
  }
}