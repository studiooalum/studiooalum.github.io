import { z } from "zod";

import { readSession } from "../../../cloudflare/lib/auth.js";
import { inferRepairCountryCode } from "../../../cloudflare/lib/repair-address.js";
import { buildRepairImageKey } from "../../../cloudflare/lib/r2.js";
import {
  assertRepairStorage,
  createRepairImageId,
  createRepairRequest,
  createRepairRequestIdentifiers,
  readRepairRequestBySubmissionId,
} from "../../../cloudflare/lib/repairs.js";
import { processNotificationOutbox } from "../../../cloudflare/lib/notifications.js";
import { errorResponse, json, noContent, validationError } from "../../../cloudflare/lib/http.js";

const MAX_IMAGE_COUNT = 4;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const SUBMISSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,119}$/;

const repairRequestSchema = z.object({
  customerName: z.string().trim().min(1, "성함을 입력해주세요.").max(120),
  email: z.string().trim().max(320).refine((value) => !value || z.string().email().safeParse(value).success, "이메일 형식을 확인해주세요.").default(""),
  phone: z.string().trim().min(1, "연락처를 입력해주세요.").max(60).refine((value) => value.replace(/\D/g, "").length >= 7, "연락처 형식을 확인해주세요."),
  shippingAddress: z.string().trim().max(500, "발송지 주소는 500자 이하로 입력해주세요.").optional().default(""),
  countryCode: z.enum(["KR", "OTHER"]).optional(),
  itemType: z.enum(["자켓", "상의", "하의", "기타", "데님", "니트", "특수소재", "가죽"], { message: "제품 종류를 선택해주세요." }),
  issueDescription: z.string().trim().min(1, "손상된 부분을 입력해주세요.").max(4000),
  desiredResult: z.enum(["기존 모습과 비슷하게 수선", "수선 흔적을 살리고 싶어요", "디자인은 오알룸에게 맡기고 싶어요", "잘 모르겠어요"], { message: "원하시는 수선 방향을 선택해주세요." }),
  budgetNote: z.string().trim().max(1000).default(""),
  archiveConsent: z.boolean().optional().default(false),
  privacyConsent: z.literal(true, { message: "개인정보 수집·이용에 동의해주세요." }),
}).refine((value) => value.shippingAddress
  ? value.shippingAddress.length >= 5
  : Boolean(value.countryCode), {
  message: "발송지 주소를 입력해주세요.",
  path: ["shippingAddress"],
});

function asBoolean(value) {
  return ["1", "true", "on", "yes"].includes(String(value || "").trim().toLowerCase());
}

function asText(value) {
  return typeof value === "string" ? value : "";
}

function getSelectedFiles(formData) {
  return formData
    .getAll("images")
    .filter((value) => value && typeof value !== "string" && Number(value.size || 0) > 0);
}

function validateImages(files) {
  if (!files.length) {
    throw Object.assign(new Error("제품 사진을 1장 이상 첨부해주세요."), { status: 400 });
  }
  if (files.length > MAX_IMAGE_COUNT) {
    throw Object.assign(new Error(`사진은 최대 ${MAX_IMAGE_COUNT}장까지 첨부할 수 있습니다.`), { status: 400 });
  }

  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.has(String(file.type || "").toLowerCase())) {
      throw Object.assign(new Error("JPG, PNG, WEBP, AVIF 이미지 파일만 첨부할 수 있습니다."), { status: 400 });
    }
    if (Number(file.size || 0) > MAX_IMAGE_SIZE) {
      throw Object.assign(new Error("각 사진은 8MB 이하로 첨부해주세요."), { status: 400 });
    }
  }
}

function buildRequestPayload(formData) {
  return {
    customerName: asText(formData.get("customerName")),
    email: asText(formData.get("email")),
    phone: asText(formData.get("phone")),
    shippingAddress: asText(formData.get("shippingAddress")),
    countryCode: asText(formData.get("countryCode")) || undefined,
    itemType: asText(formData.get("itemType")),
    issueDescription: asText(formData.get("issueDescription")) || asText(formData.get("repairDetails")),
    desiredResult: asText(formData.get("desiredResult")),
    budgetNote: asText(formData.get("budgetNote")),
    archiveConsent: asBoolean(formData.get("archiveConsent")),
    privacyConsent: asBoolean(formData.get("privacyConsent")) || asBoolean(formData.get("termsAccepted")),
  };
}

async function removeUploadedImages(bucket, images) {
  if (!bucket || !images.length) return;
  await Promise.allSettled(images.map((image) => bucket.delete(image.r2Key)));
}

function getSubmissionId(request, formData) {
  const value = String(request.headers.get("Idempotency-Key") || formData.get("submission_id") || "").trim();
  if (!value) {
    throw Object.assign(new Error("수선 접수 요청 키가 필요합니다. 페이지를 새로고침한 뒤 다시 시도해주세요."), { status: 400 });
  }
  if (!SUBMISSION_ID_PATTERN.test(value)) {
    throw Object.assign(new Error("수선 접수 요청 키를 다시 확인해주세요."), { status: 400 });
  }
  return value;
}

async function createSubmissionFingerprint(data, files) {
  const fileFingerprints = [];
  for (const file of files) {
    const fileDigest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    fileFingerprints.push({
      name: String(file.name || ""),
      type: String(file.type || ""),
      size: Number(file.size || 0),
      digest: Array.from(new Uint8Array(fileDigest), (byte) => byte.toString(16).padStart(2, "0")).join(""),
    });
  }
  const payload = JSON.stringify(data.shippingAddress ? {
    customerName: data.customerName,
    email: data.email,
    phone: data.phone,
    shippingAddress: data.shippingAddress,
    itemType: data.itemType,
    issueDescription: data.issueDescription,
    desiredResult: data.desiredResult,
    budgetNote: data.budgetNote,
    archiveConsent: data.archiveConsent,
    files: fileFingerprints,
  } : {
    customerName: data.customerName,
    email: data.email,
    phone: data.phone,
    countryCode: data.countryCode,
    itemType: data.itemType,
    issueDescription: data.issueDescription,
    desiredResult: data.desiredResult,
    budgetNote: data.budgetNote,
    archiveConsent: data.archiveConsent,
    files: fileFingerprints,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildDuplicateResponse(env, receipt) {
  return json(env, {
    ok: true,
    duplicate: true,
    requestNumber: receipt.requestNumber,
    ticketId: receipt.ticketId || "",
    submittedAt: receipt.submittedAt,
    message: "이미 완료된 수선 접수입니다. 기존 접수번호를 안내드립니다.",
    notificationStatus: receipt.notificationStatuses?.includes("failed") ? "failed" : "queued",
  });
}

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  const uploadedImages = [];
  let bucket = null;
  let submissionId = "";
  let submissionFingerprint = "";

  try {
    const contentType = String(context.request.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("multipart/form-data")) {
      return json(context.env, { ok: false, error: "수선 접수 형식을 다시 확인해주세요." }, { status: 400 });
    }

    const formData = await context.request.formData();
    if (asText(formData.get("website")).trim()) {
      return json(context.env, { ok: true, message: "수선 접수가 완료되었습니다." });
    }

    const parsed = repairRequestSchema.safeParse(buildRequestPayload(formData));
    if (!parsed.success) {
      const response = validationError(context.env, parsed.error);
      const payload = await response.json();
      return json(context.env, {
        ...payload,
        error: parsed.error.issues[0]?.message || payload.error,
      }, { status: 400 });
    }

    const files = getSelectedFiles(formData);
    const session = await readSession(context.env, context.request, { touch: false });
    const applicantEmail = String(session?.user?.email || parsed.data.email || "").trim().toLowerCase();
    if (!z.string().email().safeParse(applicantEmail).success) {
      return json(context.env, { ok: false, error: "이메일을 확인해주세요." }, { status: 400 });
    }

    submissionId = getSubmissionId(context.request, formData);
    submissionFingerprint = await createSubmissionFingerprint({ ...parsed.data, email: applicantEmail }, files);
    const existingReceipt = await readRepairRequestBySubmissionId(context.env, submissionId);
    if (existingReceipt) {
      if (existingReceipt.submissionFingerprint && existingReceipt.submissionFingerprint !== submissionFingerprint) {
        return json(context.env, { ok: false, error: "같은 요청 키에 다른 접수 내용이 사용되었습니다." }, { status: 409 });
      }
      return buildDuplicateResponse(context.env, existingReceipt);
    }

    validateImages(files);

    const identifiers = createRepairRequestIdentifiers();

    if (files.length) {
      const storage = assertRepairStorage(context.env);
      bucket = storage.bucket;
    }

    for (const [sortOrder, file] of files.entries()) {
      const imageId = createRepairImageId();
      const r2Key = buildRepairImageKey({
        requestId: identifiers.requestId,
        imageId,
        fileName: file.name,
        fileType: file.type,
      });

      await bucket.put(r2Key, file.stream(), {
        httpMetadata: {
          contentType: file.type,
          cacheControl: "private, no-store",
        },
        customMetadata: {
          requestId: identifiers.requestId,
          imageId,
        },
      });

      uploadedImages.push({
        id: imageId,
        r2Key,
        filename: file.name,
        contentType: file.type,
        byteSize: Number(file.size || 0),
        sortOrder,
      });
    }

    const submittedAt = new Date().toISOString();
    const receipt = await createRepairRequest(context.env, {
      ...parsed.data,
      requestId: identifiers.requestId,
      requestNumber: identifiers.requestNumber,
      submissionId,
      submissionFingerprint,
      customerId: session?.user?.id || null,
      countryCode: parsed.data.shippingAddress
        ? inferRepairCountryCode({ shippingAddress: parsed.data.shippingAddress })
        : parsed.data.countryCode,
      shippingAddress: parsed.data.shippingAddress,
      email: applicantEmail,
      preferredContact: "phone",
      contactPreference: "phone",
      itemType: parsed.data.itemType,
      material: "",
      itemMaterial: "",
      repairDetails: parsed.data.issueDescription,
      desiredResult: parsed.data.desiredResult,
      budgetNote: parsed.data.budgetNote,
      termsAcceptedAt: submittedAt,
      privacyConsentAt: submittedAt,
      archiveConsentAt: parsed.data.archiveConsent ? submittedAt : "",
    }, uploadedImages);

    if (receipt.notificationIds.length && typeof context.waitUntil === "function") {
      context.waitUntil(processNotificationOutbox(context.env, { ids: receipt.notificationIds }));
    }

    return json(context.env, {
      ok: true,
      duplicate: false,
      requestNumber: receipt.requestNumber,
      ticketId: receipt.ticketId,
      submittedAt: receipt.submittedAt,
      message: "수선 접수가 완료되었습니다. 안내가 발송 대기열에 저장되었습니다.",
      notificationStatus: "queued",
    }, { status: 201 });
  } catch (error) {
    await removeUploadedImages(bucket, uploadedImages);
    if (submissionId) {
      try {
        const existingReceipt = await readRepairRequestBySubmissionId(context.env, submissionId);
        if (existingReceipt) {
          if (existingReceipt.submissionFingerprint && existingReceipt.submissionFingerprint !== submissionFingerprint) {
            return json(context.env, { ok: false, error: "같은 요청 키에 다른 접수 내용이 사용되었습니다." }, { status: 409 });
          }
          return buildDuplicateResponse(context.env, existingReceipt);
        }
      } catch (lookupError) {
        if (lookupError?.status && lookupError.status !== 404) {
          console.error("Failed to resolve duplicate repair submission.", lookupError);
        }
      }
    }
    return errorResponse(context.env, error, "수선 접수를 완료하지 못했습니다.");
  }
}