import { normalizeImageRgb } from "./image-colors.js";

function sanitizeSegment(value, fallback = "asset") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "") || fallback;
}

function extensionFromType(fileType = "") {
  const type = String(fileType || "").toLowerCase();
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  if (type === "image/gif") return ".gif";
  if (type === "image/avif") return ".avif";
  if (type === "image/svg+xml") return ".svg";
  return ".bin";
}

function extensionFromName(fileName = "") {
  const match = String(fileName || "").match(/\.[a-z0-9]+$/i);
  return match ? match[0].toLowerCase() : "";
}

export function isPrivateR2Key(key) {
  const normalizedKey = String(key || "").trim();
  return normalizedKey.startsWith("repairs/")
    || normalizedKey.startsWith("repair-requests/")
    || normalizedKey.startsWith("public-content-snapshots/");
}

function buildPublicImageUrl(key, { averageRgb = "" } = {}) {
  const params = new URLSearchParams({ key: String(key || "").trim() });
  const color = normalizeImageRgb(averageRgb);
  if (color) params.set("rgb", color);
  return `/api/r2?${params.toString()}`;
}

export function buildWorkshopImageKey({ slug = "draft-workshop", target = "image", fileName = "", fileType = "" } = {}) {
  const slugSegment = sanitizeSegment(slug, "draft-workshop");
  const targetSegment = sanitizeSegment(target, "image");
  const nameSegment = sanitizeSegment(String(fileName || "").replace(/\.[a-z0-9]+$/i, ""), "upload");
  const extension = extensionFromName(fileName) || extensionFromType(fileType);
  return `workshops/${slugSegment}/${targetSegment}/${Date.now()}-${nameSegment}${extension}`;
}

export function buildWorkshopImageUrl(key, options) {
  return buildPublicImageUrl(key, options);
}

export function buildNewsletterImageKey({ slug = "draft-newsletter", target = "image", fileName = "", fileType = "" } = {}) {
  const slugSegment = sanitizeSegment(slug, "draft-newsletter");
  const targetSegment = sanitizeSegment(target, "image");
  const nameSegment = sanitizeSegment(String(fileName || "").replace(/\.[a-z0-9]+$/i, ""), "upload");
  const extension = extensionFromName(fileName) || extensionFromType(fileType);
  return `newsletters/${slugSegment}/${targetSegment}/${Date.now()}-${nameSegment}${extension}`;
}

export function buildNewsletterImageUrl(key, options) {
  return buildPublicImageUrl(key, options);
}

export function buildRepairImageKey({ requestId = "request", imageId = "image", fileName = "", fileType = "" } = {}) {
  const requestSegment = sanitizeSegment(requestId, "request");
  const imageSegment = sanitizeSegment(imageId, "image");
  const nameSegment = sanitizeSegment(String(fileName || "").replace(/\.[a-z0-9]+$/i, ""), "upload");
  const extension = extensionFromName(fileName) || extensionFromType(fileType);
  return `repair-requests/${requestSegment}/${Date.now()}-${imageSegment}-${nameSegment}${extension}`;
}

export function buildRepairGalleryKey({ imageId = "image", fileName = "", fileType = "" } = {}) {
  const imageSegment = sanitizeSegment(imageId, "image");
  const nameSegment = sanitizeSegment(String(fileName || "").replace(/\.[a-z0-9]+$/i, ""), "upload");
  const extension = extensionFromName(fileName) || extensionFromType(fileType);
  return `repair-gallery/${Date.now()}-${imageSegment}-${nameSegment}${extension}`;
}

export function buildRepairGalleryUrl(key, options) {
  return buildPublicImageUrl(key, options);
}