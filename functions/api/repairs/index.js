import { z } from "zod";

import { readSession } from "../../../cloudflare/lib/auth.js";
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
  email: z.string().trim().max(320).default(""),
  phone: z.string().trim().min(7).max(60),
  itemType: z.enum(["자켓", "상의", "하의", "데님", "니트", "기타"]),
  issueDescription: z.string().trim().min(8).max(4000),
  desiredResult: z.enum(["기존 모습과 비슷하게 수선", "수선 흔적을 살리고 싶어요", "디자인은 오알룸에게 맡기고 싶어요", "잘 모르겠어요"]),
  budgetNote: z.string().trim().max(1000).default(""),
  privacyConsent: z.literal(true),
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
    itemType: asText(formData.get("itemType")),
    issueDescription: asText(formData.get("issueDescription")) || asText(formData.get("repairDetails")),
    desiredResult: asText(formData.get("desiredResult")),
    budgetNote: asText(formData.get("budgetNote")),
    privacyConsent: asBoolean(formData.get("privacyConsent")) || asBoolean(formData.get("termsAccepted")),
  };
}

async function removeUploadedImages(bucket, images) {
  if (!bucket || !images.length) return;
  await Promise.allSettled(images.map((image) => bucket.delete(image.r2Key)));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendRepairEmail(env, { to, subject, html, text }) {
  const apiKey = String(env?.RESEND_API_KEY || "").trim();
  const from = String(env?.RESEND_FROM_EMAIL || "").trim();
  if (!apiKey || !from || !to) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  return response.ok;
}

async function sendRepairNotifications(env, { requestNumber, applicant, itemType, issueDescription, desiredResult, budgetNote }) {
  const address = "서울특별시 동대문구 이문로 145 2층 201호 / 010-4746-5999 / 오알룸 앞";
  const adminEmail = "studio.oalum@gmail.com";
  const safeName = escapeHtml(applicant.customerName);
  const safePhone = escapeHtml(applicant.phone);
  const safeEmail = escapeHtml(applicant.email);
  const safeDescription = escapeHtml(issueDescription).replace(/\n/g, "<br>");
  const safeItemType = escapeHtml(itemType);
  const safeDesiredResult = escapeHtml(desiredResult);
  const safeBudgetNote = escapeHtml(budgetNote || "미입력").replace(/\n/g, "<br>");

  const results = await Promise.allSettled([
    sendRepairEmail(env, {
      to: adminEmail,
      subject: `[Repair] ${requestNumber} ${applicant.customerName}`,
      html: `<h2>새 수선 의뢰</h2><p><strong>접수번호</strong> ${escapeHtml(requestNumber)}</p><p><strong>성함</strong> ${safeName}</p><p><strong>연락처</strong> ${safePhone}</p><p><strong>이메일</strong> ${safeEmail}</p><p><strong>제품</strong> ${safeItemType}</p><p><strong>손상 부위</strong><br>${safeDescription}</p><p><strong>희망 방향</strong> ${safeDesiredResult}</p><p><strong>기타 요청</strong><br>${safeBudgetNote}</p>`,
      text: `새 수선 의뢰\n접수번호: ${requestNumber}\n성함: ${applicant.customerName}\n연락처: ${applicant.phone}\n이메일: ${applicant.email}\n제품: ${itemType}\n손상 부위: ${issueDescription}\n희망 방향: ${desiredResult}\n기타 요청: ${budgetNote || "미입력"}`,
    }),
    sendRepairEmail(env, {
      to: applicant.email,
      subject: `Studio OALUM 수선 접수 ${requestNumber}`,
      html: `<h2>수선 의뢰가 접수되었습니다.</h2><p>${safeName}님, 신청해주셔서 감사합니다.</p><p><strong>접수번호</strong> ${escapeHtml(requestNumber)}</p><p>아래 주소로 수선 의뢰 제품을 보내주세요.</p><p>${escapeHtml(address)}</p><p>물건이 도착하면 상태를 확인한 뒤 수선 방향과 예상 가격을 안내드리겠습니다.</p>`,
      text: `${applicant.customerName}님, 수선 의뢰가 접수되었습니다.\n접수번호: ${requestNumber}\n택배 주소: ${address}\n물건이 도착하면 상태를 확인한 뒤 수선 방향과 예상 가격을 안내드리겠습니다.`,
    }),
  ]);

  return {
    admin: results[0].status === "fulfilled" && results[0].value === true,
    applicant: results[1].status === "fulfilled" && results[1].value === true,
  };
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
    const session = await readSession(context.env, context.request, { touch: false });
    const applicantEmail = String(session?.user?.email || parsed.data.email || "").trim().toLowerCase();
    if (!z.string().email().safeParse(applicantEmail).success) {
      return json(context.env, { ok: false, error: "이메일을 확인해주세요." }, { status: 400 });
    }

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
      archiveConsentAt: "",
    }, uploadedImages);

    const notifications = await sendRepairNotifications(context.env, {
      requestNumber: receipt.requestNumber,
      applicant: {
        customerName: parsed.data.customerName,
        phone: parsed.data.phone,
        email: applicantEmail,
      },
      itemType: parsed.data.itemType,
      issueDescription: parsed.data.issueDescription,
      desiredResult: parsed.data.desiredResult,
      budgetNote: parsed.data.budgetNote,
    });

    return json(context.env, {
      ok: true,
      requestNumber: receipt.requestNumber,
      submittedAt: receipt.submittedAt,
      message: "수선 접수가 완료되었습니다. 확인 후 입력하신 연락처로 안내드리겠습니다.",
      notifications,
    }, { status: 201 });
  } catch (error) {
    await removeUploadedImages(bucket, uploadedImages);
    return errorResponse(context.env, error, "수선 접수를 완료하지 못했습니다.");
  }
}