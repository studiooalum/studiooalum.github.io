import { z } from "zod";

import { requireAdminAccess } from "../../../cloudflare/lib/admin.js";
import {
  archiveNewsletterPost,
  deleteNewsletterPost,
  readNewsletterAdminSnapshot,
  upsertNewsletterPost,
} from "../../../cloudflare/lib/newsletters.js";
import { normalizeImageRgb } from "../../../cloudflare/lib/image-colors.js";
import { buildNewsletterImageKey, buildNewsletterImageUrl } from "../../../cloudflare/lib/r2.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const MAX_R2_UPLOAD_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

const newsletterPostSchema = z.object({
  id: z.string().trim().max(80).optional().default(""),
  slug: z.string().trim().max(120).optional().default(""),
  title: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().max(500).optional().default(""),
  contentHtml: z.string().max(50000).optional().default(""),
  coverImageUrl: z.string().trim().max(2000).optional().default(""),
  coverImageR2Key: z.string().trim().max(500).optional().default(""),
  coverImageAlt: z.string().trim().max(200).optional().default(""),
  categories: z.array(z.string().trim().min(1).max(40)).max(8).optional().default([]),
  status: z.enum(["draft", "published", "archived"]).optional().default("draft"),
  publishedAt: z.string().trim().max(40).optional().default(""),
});

const newsletterActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("saveNewsletterPost"), post: newsletterPostSchema }),
  z.object({ action: z.literal("archiveNewsletterPost"), slug: z.string().trim().min(1).max(120) }),
  z.object({ action: z.literal("deleteNewsletterPost"), slug: z.string().trim().min(1).max(120) }),
]);

function cleanUploadValue(value, fallback) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-_]+|[.-_]+$/g, "") || fallback;
}

async function uploadNewsletterImage(env, formData) {
  if (!env?.OALUM_R2) {
    throw Object.assign(new Error("R2 바인딩이 아직 준비되지 않았습니다."), { status: 503 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw Object.assign(new Error("업로드할 이미지를 선택해주세요."), { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.has(String(file.type || "").toLowerCase())) {
    throw Object.assign(new Error("JPG, PNG, WEBP, GIF, AVIF 이미지만 업로드할 수 있습니다."), { status: 400 });
  }
  if (file.size > MAX_R2_UPLOAD_SIZE) {
    throw Object.assign(new Error("이미지 파일은 10MB 이하로 업로드해주세요."), { status: 400 });
  }

  const slug = cleanUploadValue(formData.get("slug"), "draft-newsletter");
  const target = cleanUploadValue(formData.get("target"), "image");
  const averageRgb = normalizeImageRgb(formData.get("imageColor"));
  const key = buildNewsletterImageKey({
    slug,
    target,
    fileName: file.name,
    fileType: file.type,
  });

  await env.OALUM_R2.put(key, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type,
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
    url: buildNewsletterImageUrl(key, { averageRgb }),
    filename: file.name,
    contentType: file.type,
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
    const snapshot = await readNewsletterAdminSnapshot(context.env);
    return json(context.env, { ok: true, ...snapshot });
  } catch (error) {
    return errorResponse(context.env, error, "뉴스레터 관리 데이터를 불러오지 못했습니다.");
  }
}

export async function onRequestPost(context) {
  try {
    await requireAdminAccess(context);
    const contentType = String(context.request.headers.get("content-type") || "").toLowerCase();

    if (contentType.includes("multipart/form-data")) {
      const formData = await context.request.formData();
      if (String(formData.get("action") || "").trim() !== "uploadNewsletterImage") {
        return json(context.env, { ok: false, error: "입력한 내용을 다시 확인해주세요." }, { status: 400 });
      }
      const image = await uploadNewsletterImage(context.env, formData);
      return json(context.env, { ok: true, message: "이미지를 업로드했습니다.", image });
    }

    const parsed = newsletterActionSchema.safeParse(await readJson(context.request));
    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    let message = "뉴스레터 글을 저장했습니다.";
    if (parsed.data.action === "saveNewsletterPost") {
      await upsertNewsletterPost(context.env, parsed.data.post);
    } else if (parsed.data.action === "archiveNewsletterPost") {
      await archiveNewsletterPost(context.env, { slug: parsed.data.slug });
      message = "뉴스레터 글을 보관했습니다.";
    } else {
      const deleted = await deleteNewsletterPost(context.env, { slug: parsed.data.slug });
      if (context.env?.OALUM_R2) {
        await Promise.allSettled(deleted.r2Keys.map((key) => context.env.OALUM_R2.delete(key)));
      }
      message = "뉴스레터 글과 연결 이미지를 삭제했습니다.";
    }

    const snapshot = await readNewsletterAdminSnapshot(context.env);
    return json(context.env, {
      ok: true,
      message,
      ...snapshot,
    });
  } catch (error) {
    return errorResponse(context.env, error, "뉴스레터 글을 저장하지 못했습니다.");
  }
}
