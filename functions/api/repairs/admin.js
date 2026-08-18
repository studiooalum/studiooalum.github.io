import { z } from "zod";

import { requireAdminAccess } from "../../../cloudflare/lib/admin.js";
import {
  createRepairGalleryImage,
  deleteRepairGalleryImage,
  readRepairAdminSnapshot,
  updateRepairRequest,
} from "../../../cloudflare/lib/repairs.js";
import { normalizeImageRgb } from "../../../cloudflare/lib/image-colors.js";
import { buildRepairGalleryKey } from "../../../cloudflare/lib/r2.js";
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

const repairAdminActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("updateRepairRequest"), request: repairUpdateSchema }),
  z.object({ action: z.literal("deleteRepairGalleryImage"), id: z.string().trim().min(1).max(80) }),
]);

const GALLERY_METHODS = new Set(["patch", "woven", "sashiko", "boro"]);
const GALLERY_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

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
    const snapshot = await readRepairAdminSnapshot(context.env);
    return json(context.env, { ok: true, ...snapshot });
  } catch (error) {
    return errorResponse(context.env, error, "수선 관리 데이터를 불러오지 못했습니다.");
  }
}

export async function onRequestPost(context) {
  try {
    await requireAdminAccess(context);
    const contentType = String(context.request.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("multipart/form-data")) {
      const formData = await context.request.formData();
      if (String(formData.get("action") || "") !== "uploadRepairGalleryImage") {
        return json(context.env, { ok: false, error: "입력 내용을 확인해주세요." }, { status: 400 });
      }
      const gallery = await uploadRepairGalleryImage(context, formData);
      const snapshot = await readRepairAdminSnapshot(context.env);
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
      snapshot = await readRepairAdminSnapshot(context.env);
    } else {
      snapshot = await updateRepairRequest(context.env, parsed.data.request);
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