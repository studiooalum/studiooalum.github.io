import { z } from "zod";

import { buildRepairImageKey } from "../../../cloudflare/lib/r2.js";
import {
  assertRepairStorage,
  createRepairImageId,
  createRepairRequest,
  createRepairRequestIdentifiers,
} from "../../../cloudflare/lib/repairs.js";
import { errorResponse, json, noContent, validationError } from "../../../cloudflare/lib/http.js";

const MAX_IMAGE_COUNT = 4;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

const repairRequestSchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(7).max(60),
  preferredContact: z.enum(["email", "phone"]).default("email"),
  itemType: z.string().trim().min(1).max(100),
  material: z.string().trim().min(1).max(120),
  issueDescription: z.string().trim().min(8).max(4000),
  desiredResult: z.string().trim().min(1).max(2000),
  budgetNote: z.string().trim().max(1000).default(""),
  privacyConsent: z.literal(true),
  archiveConsent: z.boolean().default(false),
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
    throw Object.assign(new Error("수선할 물건의 사진을 1장 이상 첨부해주세요."), { status: 400 });
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
    preferredContact: asText(formData.get("preferredContact")) || asText(formData.get("contactPreference")) || "email",
    itemType: asText(formData.get("itemType")),
    material: asText(formData.get("material")) || asText(formData.get("itemMaterial")),
    issueDescription: asText(formData.get("issueDescription")) || asText(formData.get("repairDetails")),
    desiredResult: asText(formData.get("desiredResult")),
    budgetNote: asText(formData.get("budgetNote")),
    privacyConsent: asBoolean(formData.get("privacyConsent")) || asBoolean(formData.get("termsAccepted")),
    archiveConsent: asBoolean(formData.get("archiveConsent")),
  };
}

async function removeUploadedImages(bucket, images) {
  if (!bucket || !images.length) return;
  await Promise.allSettled(images.map((image) => bucket.delete(image.r2Key)));
}

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  const uploadedImages = [];
  let bucket = null;

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
      return validationError(context.env, parsed.error);
    }

    const files = getSelectedFiles(formData);
    validateImages(files);

    const storage = assertRepairStorage(context.env);
    bucket = storage.bucket;
    const identifiers = createRepairRequestIdentifiers();

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
      contactPreference: parsed.data.preferredContact,
      itemMaterial: parsed.data.material,
      repairDetails: parsed.data.issueDescription,
      termsAcceptedAt: submittedAt,
      privacyConsentAt: submittedAt,
      archiveConsentAt: parsed.data.archiveConsent ? submittedAt : "",
    }, uploadedImages);

    return json(context.env, {
      ok: true,
      requestNumber: receipt.requestNumber,
      submittedAt: receipt.submittedAt,
      message: "수선 접수가 완료되었습니다. 확인 후 입력하신 연락처로 안내드리겠습니다.",
    }, { status: 201 });
  } catch (error) {
    await removeUploadedImages(bucket, uploadedImages);
    return errorResponse(context.env, error, "수선 접수를 완료하지 못했습니다.");
  }
}