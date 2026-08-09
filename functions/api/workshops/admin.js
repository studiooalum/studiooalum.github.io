import { z } from "zod";

import { requireAdminAccess } from "../../../cloudflare/lib/admin.js";
import {
  archiveWorkshopContent,
  createWorkshopDateBlock,
  deleteWorkshopDateBlock,
  readWorkshopAdminSnapshot,
  upsertWorkshopContent,
  updateWorkshopReservationStatus,
} from "../../../cloudflare/lib/workshops.js";
import { buildWorkshopImageKey, buildWorkshopImageUrl } from "../../../cloudflare/lib/r2.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const workshopGalleryImageSchema = z.object({
  url: z.string().trim().max(2000).optional().default(""),
  r2Key: z.string().trim().max(500).optional().default(""),
  alt: z.string().trim().max(200).optional().default(""),
  caption: z.string().trim().max(300).optional().default(""),
  kind: z.string().trim().max(60).optional().default(""),
});

const workshopSlotSchema = z.object({
  _key: z.string().trim().max(160).optional().default(""),
  label: z.string().trim().max(160).optional().default(""),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().trim().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().trim().max(5).optional().default(""),
  capacity: z.number().int().min(1).max(100).optional().default(1),
  isBlocked: z.boolean().optional().default(false),
  status: z.string().trim().max(40).optional().default("open"),
  reason: z.string().trim().max(200).optional().default(""),
});

const workshopBookingConfigSchema = z.object({
  mode: z.enum(["daily", "scheduled"]).optional().default("scheduled"),
  dailyStartTime: z.string().trim().regex(/^\d{2}:\d{2}$/).optional().default("10:00"),
  dailyEndTime: z.string().trim().regex(/^\d{2}:\d{2}$/).optional().default("13:00"),
  dailyCapacity: z.number().int().min(1).max(4).optional().default(4),
  maxBookingMonths: z.number().int().min(1).max(6).optional().default(6),
  allowSharedBookings: z.boolean().optional().default(false),
  attendeePrices: z.object({
    1: z.number().int().min(0).max(100000000).optional().default(120000),
    2: z.number().int().min(0).max(100000000).optional().default(200000),
    3: z.number().int().min(0).max(100000000).optional().default(270000),
    4: z.number().int().min(0).max(100000000).optional().default(300000),
  }).optional().default({}),
}).optional().default({});

const workshopContentInputSchema = z.object({
  id: z.string().trim().max(80).optional().default(""),
  slug: z.string().trim().max(120).optional().default(""),
  title: z.string().trim().min(1).max(160),
  category: z.string().trim().max(80).optional().default(""),
  summary: z.string().trim().max(400).optional().default(""),
  description: z.string().trim().max(12000).optional().default(""),
  durationLabel: z.string().trim().max(80).optional().default(""),
  levelLabel: z.string().trim().max(80).optional().default(""),
  audienceLabel: z.string().trim().max(80).optional().default(""),
  maxCapacity: z.number().int().min(0).max(100).optional().default(0),
  capacityLabel: z.string().trim().max(80).optional().default(""),
  price: z.number().int().min(0).max(100000000).optional().default(0),
  bookingNotice: z.string().trim().max(500).optional().default(""),
  hostName: z.string().trim().max(120).optional().default(""),
  locationName: z.string().trim().max(160).optional().default(""),
  locationAddress: z.string().trim().max(240).optional().default(""),
  locationDetail: z.string().trim().max(240).optional().default(""),
  materials: z.array(z.string().trim().max(200)).optional().default([]),
  thingsToBring: z.array(z.string().trim().max(200)).optional().default([]),
  posterImageUrl: z.string().trim().max(2000).optional().default(""),
  posterImageR2Key: z.string().trim().max(500).optional().default(""),
  posterImageAlt: z.string().trim().max(200).optional().default(""),
  galleryImages: z.array(workshopGalleryImageSchema).optional().default([]),
  scheduleSlots: z.array(workshopSlotSchema).optional().default([]),
  bookingConfig: workshopBookingConfigSchema,
  status: z.enum(["draft", "published", "archived"]).optional().default("draft"),
  sortOrder: z.number().int().min(-9999).max(9999).optional().default(0),
  sourceMode: z.string().trim().max(40).optional().default("d1-r2-ready"),
  publishedAt: z.string().trim().max(40).optional().default(""),
});

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
    slotDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().trim().max(200).optional().default("예약 불가 일정입니다."),
  }),
  z.object({
    action: z.literal("unblockDate"),
    blockId: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal("saveWorkshopContent"),
    workshop: workshopContentInputSchema,
  }),
  z.object({
    action: z.literal("archiveWorkshopContent"),
    slug: z.string().trim().min(1).max(120),
  }),
]);

const MAX_R2_UPLOAD_SIZE = 10 * 1024 * 1024;

function cleanUploadValue(value, fallback = "asset") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-_]+|[.-_]+$/g, "") || fallback;
}

async function uploadWorkshopImage(env, formData) {
  if (!env?.OALUM_R2) {
    throw Object.assign(new Error("R2 바인딩이 아직 준비되지 않았습니다."), { status: 503 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw Object.assign(new Error("업로드할 이미지를 선택해주세요."), { status: 400 });
  }

  if (!String(file.type || "").startsWith("image/")) {
    throw Object.assign(new Error("이미지 파일만 업로드할 수 있습니다."), { status: 400 });
  }

  if (file.size > MAX_R2_UPLOAD_SIZE) {
    throw Object.assign(new Error("이미지 파일은 10MB 이하로 업로드해주세요."), { status: 400 });
  }

  const slug = cleanUploadValue(formData.get("slug"), "draft-workshop");
  const target = cleanUploadValue(formData.get("target"), "image");
  const key = buildWorkshopImageKey({
    slug,
    target,
    fileName: file.name,
    fileType: file.type,
  });

  await env.OALUM_R2.put(key, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type || "application/octet-stream",
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: {
      filename: file.name,
      slug,
      target,
    },
  });

  return {
    key,
    url: buildWorkshopImageUrl(key),
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size,
  };
}

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

    const contentType = String(context.request.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("multipart/form-data")) {
      const formData = await context.request.formData();
      const action = String(formData.get("action") || "").trim();

      if (action !== "uploadWorkshopImage") {
        return json(context.env, {
          ok: false,
          error: "입력한 내용을 다시 확인해주세요.",
        }, { status: 400 });
      }

      const image = await uploadWorkshopImage(context.env, formData);
      return json(context.env, {
        ok: true,
        message: "이미지를 R2에 업로드했습니다.",
        image,
      });
    }

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
    } else if (data.action === "saveWorkshopContent") {
      await upsertWorkshopContent(context.env, data.workshop);
      resultMessage = data.workshop.status === "published"
        ? "워크숍 콘텐츠를 발행 상태로 저장했습니다."
        : "워크숍 콘텐츠를 저장했습니다.";
    } else if (data.action === "archiveWorkshopContent") {
      await archiveWorkshopContent(context.env, { slug: data.slug });
      resultMessage = "워크숍 콘텐츠를 보관 상태로 변경했습니다.";
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