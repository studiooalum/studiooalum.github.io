import { z } from "zod";

import { requireAdminAccess } from "../../../cloudflare/lib/admin.js";
import {
  createRepairGalleryImage,
  deleteRepairGalleryImage,
  readRepairAdminSnapshot,
  updateRepairGalleryImageStatus,
  updateRepairRequest,
} from "../../../cloudflare/lib/repairs.js";
import { processNotificationOutbox } from "../../../cloudflare/lib/notifications.js";
import { normalizeImageRgb } from "../../../cloudflare/lib/image-colors.js";
import { readRepairStudioContent, updateRepairStudioContent } from "../../../cloudflare/lib/repair-studio-content.js";
import { buildRepairGalleryKey } from "../../../cloudflare/lib/r2.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const repairStatusSchema = z.enum([
  "received",
  "item_received",
  "in_progress",
  "payment_pending",
  "shipping",
  "closed",
  "rejected",
  "cancelled",
]);

const repairUpdateSchema = z.object({
  id: z.string().trim().min(1).max(80),
  expectedVersion: z.number().int().min(1),
  status: repairStatusSchema.optional(),
  adminNote: z.string().trim().max(4000).optional(),
  quoteAmount: z.number().int().min(0).max(100000000).nullable().optional(),
  finalAmount: z.number().int().min(0).max(100000000).nullable().optional(),
  bankAccount: z.string().trim().max(500).optional(),
  paymentInstructions: z.string().trim().max(2000).optional(),
  paymentConfirmedAt: z.string().trim().max(40).optional(),
  carrier: z.string().trim().max(120).optional(),
  trackingNumber: z.string().trim().max(160).optional(),
  trackingUrl: z.string().trim().max(1000).refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "배송 조회 URL을 다시 확인해주세요.").optional(),
}).refine((request) => (
  request.status !== undefined
  || request.adminNote !== undefined
  || request.quoteAmount !== undefined
  || request.finalAmount !== undefined
  || request.bankAccount !== undefined
  || request.paymentInstructions !== undefined
  || request.paymentConfirmedAt !== undefined
  || request.carrier !== undefined
  || request.trackingNumber !== undefined
  || request.trackingUrl !== undefined
), {
  message: "변경할 수선 접수 정보를 입력해주세요.",
});

const repairAdminActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("updateRepairRequest"), request: repairUpdateSchema }),
  z.object({
    action: z.literal("updateRepairStudioContent"),
    content: z.object({
      title: z.string().trim().min(1).max(120),
      lead: z.string().trim().min(1).max(500),
      paragraphs: z.array(z.string().trim().min(1).max(4000)).min(1).max(12),
      ctaLabel: z.string().trim().min(1).max(80),
      isPublished: z.boolean(),
    }),
  }),
  z.object({ action: z.literal("setRepairGalleryPublished"), id: z.string().trim().min(1).max(80), published: z.boolean() }),
  z.object({ action: z.literal("deleteRepairGalleryImage"), id: z.string().trim().min(1).max(80) }),
]);

const GALLERY_METHODS = new Set(["patch", "woven", "sashiko", "boro"]);
const GALLERY_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

async function readFullSnapshot(env) {
  return {
    ...(await readRepairAdminSnapshot(env)),
    content: await readRepairStudioContent(env, { includeDraft: true }),
  };
}

async function uploadRepairGalleryImage(context, formData) {
  if (!context.env?.OALUM_R2) {
    throw Object.assign(new Error("R2 바인딩이 준비되지 않았습니다."), { status: 503 });
  }
  const file = formData.get("file");
  if (!(file instanceof File) || !GALLERY_IMAGE_TYPES.has(String(file.type || "").toLowerCase())) {
    throw Object.assign(new Error("JPG, PNG, WEBP, AVIF 이미지를 선택해주세요."), { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    throw Object.assign(new Error("이미지는 10MB 이하로 업로드해주세요."), { status: 400 });
  }
  const methods = formData.getAll("methods").map((value) => String(value).trim().toLowerCase()).filter((value) => GALLERY_METHODS.has(value));
  if (!methods.length) {
    throw Object.assign(new Error("수선 방식을 하나 이상 선택해주세요."), { status: 400 });
  }
  const id = `RPG_${crypto.randomUUID().replace(/-/g, "").toUpperCase()}`;
  const key = buildRepairGalleryKey({ imageId: id, fileName: file.name, fileType: file.type });
  const averageRgb = normalizeImageRgb(formData.get("imageColor"));
  await context.env.OALUM_R2.put(key, file.stream(), {
    httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: {
      galleryId: id,
      methods: methods.join(","),
      ...(averageRgb ? { averageRgb } : {}),
    },
  });
  try {
    return await createRepairGalleryImage(context.env, {
      id,
      r2Key: key,
      filename: file.name,
      contentType: file.type,
      methods,
      averageRgb,
      sortOrder: Number(formData.get("sortOrder") || 0),
    });
  } catch (error) {
    await context.env.OALUM_R2.delete(key);
    throw error;
  }
}

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    await requireAdminAccess(context);
    if (typeof context.waitUntil === "function") {
      context.waitUntil(processNotificationOutbox(context.env, { limit: 10 }).catch((error) => {
        console.error("Failed to process Repair notification outbox.", error);
      }));
    }
    const snapshot = await readFullSnapshot(context.env);
    return json(context.env, { ok: true, ...snapshot });
  } catch (error) {
    return errorResponse(context.env, error, "수선 관리 데이터를 불러오지 못했습니다.");
  }
}

export async function onRequestPost(context) {
  try {
    const adminAccess = await requireAdminAccess(context);
    const contentType = String(context.request.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("multipart/form-data")) {
      const formData = await context.request.formData();
      if (String(formData.get("action") || "") !== "uploadRepairGalleryImage") {
        return json(context.env, { ok: false, error: "입력 내용을 확인해주세요." }, { status: 400 });
      }
      const gallery = await uploadRepairGalleryImage(context, formData);
      const snapshot = await readFullSnapshot(context.env);
      return json(context.env, { ok: true, gallery, ...snapshot });
    }
    const parsed = repairAdminActionSchema.safeParse(await readJson(context.request));
    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    let snapshot;
    if (parsed.data.action === "deleteRepairGalleryImage") {
      const removed = await deleteRepairGalleryImage(context.env, parsed.data.id);
      if (context.env?.OALUM_R2 && removed.r2Key) await context.env.OALUM_R2.delete(removed.r2Key);
      snapshot = await readFullSnapshot(context.env);
    } else if (parsed.data.action === "setRepairGalleryPublished") {
      await updateRepairGalleryImageStatus(context.env, parsed.data.id, parsed.data.published);
      snapshot = await readFullSnapshot(context.env);
    } else if (parsed.data.action === "updateRepairStudioContent") {
      await updateRepairStudioContent(context.env, parsed.data.content);
      snapshot = await readFullSnapshot(context.env);
    } else {
      snapshot = await updateRepairRequest(context.env, {
        ...parsed.data.request,
        actorType: "admin",
        actorId: adminAccess.issuedAt || adminAccess.method,
      });
      if (snapshot.operation?.notificationIds?.length && typeof context.waitUntil === "function") {
        context.waitUntil(processNotificationOutbox(context.env, { ids: snapshot.operation.notificationIds }).catch((error) => {
          console.error("Failed to process Repair status notification.", error);
        }));
      }
    }
    return json(context.env, {
      ok: true,
      message: "수선 접수 상태를 저장했습니다.",
      ...snapshot,
    });
  } catch (error) {
    return errorResponse(context.env, error, "수선 접수 상태를 저장하지 못했습니다.");
  }
}