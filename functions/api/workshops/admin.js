import { z } from "zod";

import { requireAdminAccess } from "../../../cloudflare/lib/admin.js";
import { saveCustomWorkshopContent, updateWorkshopInquiry } from "../../../cloudflare/lib/workshop-inquiries.js";
import {
  archiveWorkshopContent,
  cancelWorkshopGroup,
  createWorkshopDateBlock,
  deleteWorkshopContent,
  deleteWorkshopDateBlock,
  deleteWorkshopReservation,
  finalizeWorkshopGroup,
  readWorkshopAdminSnapshot,
  refundWorkshopPayment,
  sendWorkshopPaymentRequest,
  upsertWorkshopContent,
  updateWorkshopReservationStatus,
} from "../../../cloudflare/lib/workshops.js";
import { normalizeImageRgb } from "../../../cloudflare/lib/image-colors.js";
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
  startTime: z.string().trim().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().trim().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  capacity: z.number().int().min(1).max(100).optional().default(1),
  isBlocked: z.boolean().optional().default(false),
  status: z.string().trim().max(40).optional().default("open"),
  reason: z.string().trim().max(200).optional().default(""),
});

const workshopTypeSchema = z.enum(["daily", "event", "multiSession"]);
const legacyWorkshopTypeSchema = z.enum(["daily", "event", "multiSession", "one_day_open", "one_day_fixed", "multi_session"]);

function resolveWorkshopType(workshopType, legacyType, mode) {
  if (workshopType) return workshopType;
  if (legacyType === "one_day_open") return "daily";
  if (legacyType === "one_day_fixed") return "event";
  if (legacyType === "multi_session") return "multiSession";
  if (legacyType) return legacyType;
  return mode === "daily" ? "daily" : "event";
}

const workshopBookingConfigSchema = z.preprocess((value) => (
  value && typeof value === "object" && !Array.isArray(value) ? value : {}
), z.object({
  workshopType: workshopTypeSchema.optional(),
  type: legacyWorkshopTypeSchema.optional(),
  mode: z.enum(["daily", "scheduled"]).optional(),
  dailyStartTime: z.string().trim().regex(/^\d{2}:\d{2}$/).optional().default("10:00"),
  dailyEndTime: z.string().trim().regex(/^\d{2}:\d{2}$/).optional().default("13:00"),
  dailyCapacity: z.number().int().min(1).max(100).optional().default(4),
  dailyTimeSlots: z.array(z.object({
    startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  }).refine((slot) => slot.endTime > slot.startTime, "종료 시간은 시작 시간보다 늦어야 합니다.")).max(12).optional().default([]),
  maxBookingMonths: z.number().int().min(1).max(6).optional().default(6),
  attendeePrices: z.object({
    1: z.number().int().min(0).max(100000000).optional(),
    2: z.number().int().min(0).max(100000000).optional(),
    3: z.number().int().min(0).max(100000000).optional(),
    4: z.number().int().min(0).max(100000000).optional(),
  }).optional().default({}),
  fixedPrice: z.number().int().min(0).max(100000000).optional().default(0),
  minParticipants: z.number().int().min(1).max(100).optional().default(1),
  maxParticipants: z.number().int().min(1).max(100).optional().default(4),
  paymentDeadlineHours: z.number().int().min(1).max(720).optional().default(48),
}).transform(({ type, workshopType, mode, ...config }) => {
  const resolvedWorkshopType = resolveWorkshopType(workshopType, type, mode);
  return {
    ...config,
    workshopType: resolvedWorkshopType,
    mode: resolvedWorkshopType === "daily" ? "daily" : "scheduled",
  };
}));

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
  scheduleSlots: z.array(workshopSlotSchema).max(100).optional().default([]),
  bookingConfig: workshopBookingConfigSchema,
  status: z.enum(["draft", "published", "archived"]).optional().default("draft"),
  sortOrder: z.number().int().min(-9999).max(9999).optional().default(0),
  sourceMode: z.string().trim().max(40).optional().default("d1-r2-ready"),
  publishedAt: z.string().trim().max(40).optional().default(""),
}).superRefine((workshop, context) => {
  const bookingConfig = workshop.bookingConfig;
  const workshopType = bookingConfig.workshopType;

  if (workshopType === "daily" && workshop.scheduleSlots.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scheduleSlots"],
      message: "일일 워크샵은 개별 세션 일정을 저장할 수 없습니다.",
    });
  }

  if (bookingConfig.minParticipants > bookingConfig.maxParticipants) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bookingConfig", "minParticipants"],
      message: "최소 모집 인원은 최대 모집 인원보다 클 수 없습니다.",
    });
  }

  if (workshop.status !== "published") return;

  if (workshopType === "daily") {
    if (bookingConfig.dailyStartTime >= bookingConfig.dailyEndTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bookingConfig", "dailyEndTime"],
        message: "일일 워크샵의 종료 시간은 시작 시간보다 늦어야 합니다.",
      });
    }

    for (let attendeeCount = 1; attendeeCount <= Math.min(4, bookingConfig.dailyCapacity); attendeeCount += 1) {
      if (!(bookingConfig.attendeePrices[attendeeCount] > 0 || bookingConfig.fixedPrice > 0)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bookingConfig", "attendeePrices", attendeeCount],
          message: "원데이클래스 가격을 입력해주세요.",
        });
        break;
      }
    }
    return;
  }

  if (!workshop.scheduleSlots.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scheduleSlots"],
      message: "오알룸 워크샵의 회차를 1개 이상 입력해주세요.",
    });
  }

  if (bookingConfig.fixedPrice <= 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bookingConfig", "fixedPrice"],
      message: "이벤트 및 다회차 워크샵의 고정 가격을 입력해주세요.",
    });
  }
  const schedules = new Set();
  for (const slot of workshop.scheduleSlots) {
    const date = new Date(`${slot.date}T00:00:00Z`);
    const key = `${slot.date} ${slot.startTime}`;
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== slot.date || slot.endTime <= slot.startTime || schedules.has(key)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduleSlots"], message: "회차 날짜, 시작·종료 시간 또는 중복 일정을 확인해주세요." });
    }
    schedules.add(key);
  }
});

const workshopAdminActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("saveCustomWorkshopImage"), imageUrl: z.string().trim().max(2000), imageAlt: z.string().trim().max(200).optional().default("맞춤 워크샵") }),
  z.object({ action: z.literal("updateWorkshopInquiry"), inquiryId: z.string().min(1).max(80), status: z.enum(["received", "contacted", "closed"]), adminNote: z.string().trim().max(2000).optional().default("") }),
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
  z.object({
    action: z.literal("deleteWorkshopContent"),
    slug: z.string().trim().min(1).max(120),
  }),
  z.object({
    action: z.literal("deleteWorkshopReservation"),
    reservationId: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal("finalizeWorkshopGroup"),
    groupId: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal("cancelWorkshopGroup"),
    groupId: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal("sendWorkshopPaymentRequest"),
    groupId: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal("refundWorkshopPayment"),
    reservationId: z.string().trim().min(1).max(80),
    cancelReason: z.string().trim().max(200).optional().default("관리자 요청으로 워크숍 결제를 취소했습니다."),
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

  if (!["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"].includes(file.type)) {
    throw Object.assign(new Error("이미지 파일만 업로드할 수 있습니다."), { status: 400 });
  }

  if (file.size > MAX_R2_UPLOAD_SIZE) {
    throw Object.assign(new Error("이미지 파일은 10MB 이하로 업로드해주세요."), { status: 400 });
  }

  const slug = cleanUploadValue(formData.get("slug"), "draft-workshop");
  const target = cleanUploadValue(formData.get("target"), "image");
  const averageRgb = normalizeImageRgb(formData.get("imageColor"));
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
      ...(averageRgb ? { averageRgb } : {}),
    },
  });

  return {
    key,
    url: buildWorkshopImageUrl(key, { averageRgb }),
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    averageRgb,
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
    let actionResult = {};

    if (data.action === "saveCustomWorkshopImage") {
      await saveCustomWorkshopContent(context.env, data);
      resultMessage = "맞춤 워크샵 대표 이미지를 저장했습니다.";
    } else if (data.action === "updateWorkshopInquiry") {
      await updateWorkshopInquiry(context.env, data);
      resultMessage = "문의 처리 내용을 저장했습니다.";
    } else if (data.action === "cancelReservation") {
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
    } else if (data.action === "deleteWorkshopContent") {
      actionResult = await deleteWorkshopContent(context.env, { slug: data.slug });
      if (context.env?.OALUM_R2) {
        await Promise.allSettled(actionResult.r2Keys.map((key) => context.env.OALUM_R2.delete(key)));
      }
      resultMessage = "워크숍 콘텐츠와 연결 이미지를 삭제했습니다.";
    } else if (data.action === "deleteWorkshopReservation") {
      actionResult = await deleteWorkshopReservation(context.env, { reservationId: data.reservationId });
      resultMessage = "취소된 워크숍 예약을 삭제했습니다.";
    } else if (data.action === "finalizeWorkshopGroup") {
      actionResult = await finalizeWorkshopGroup(context.env, data);
      resultMessage = "그룹 모집을 마감하고 최종 결제 금액을 계산했습니다.";
    } else if (data.action === "cancelWorkshopGroup") {
      actionResult = { group: await cancelWorkshopGroup(context.env, data) };
      resultMessage = "워크숍 그룹과 미결제 신청을 취소했습니다.";
    } else if (data.action === "sendWorkshopPaymentRequest") {
      actionResult = await sendWorkshopPaymentRequest(context.env, {
        ...data,
        origin: new URL(context.request.url).origin,
      });
      resultMessage = actionResult.sentCount > 0
        ? `${actionResult.sentCount}명에게 결제 요청 메일을 보냈습니다.`
        : "결제 링크를 준비했습니다. 메일 설정이 없으면 링크를 복사해 전달해주세요.";
    } else if (data.action === "refundWorkshopPayment") {
      actionResult = await refundWorkshopPayment(context.env, data);
      resultMessage = "워크숍 결제를 환불 처리했습니다.";
    }

    const snapshot = await readWorkshopAdminSnapshot(context.env, {
      query: "",
      status: "all",
      limit: 40,
    });

    return json(context.env, {
      ok: true,
      message: resultMessage,
      actionResult,
      ...actionResult,
      ...snapshot,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to update workshop admin data.");
  }
}
