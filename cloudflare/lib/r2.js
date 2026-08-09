function sanitizeSegment(value, fallback = "asset") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-_]+|[.-_]+$/g, "") || fallback;
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

export function buildWorkshopImageKey({ slug = "draft-workshop", target = "image", fileName = "", fileType = "" } = {}) {
  const slugSegment = sanitizeSegment(slug, "draft-workshop");
  const targetSegment = sanitizeSegment(target, "image");
  const nameSegment = sanitizeSegment(String(fileName || "").replace(/\.[a-z0-9]+$/i, ""), "upload");
  const extension = extensionFromName(fileName) || extensionFromType(fileType);
  return `workshops/${slugSegment}/${targetSegment}/${Date.now()}-${nameSegment}${extension}`;
}

export function buildWorkshopImageUrl(key) {
  return `/api/r2?key=${encodeURIComponent(String(key || "").trim())}`;
}

export function buildNewsletterImageKey({ slug = "draft-newsletter", target = "image", fileName = "", fileType = "" } = {}) {
  const slugSegment = sanitizeSegment(slug, "draft-newsletter");
  const targetSegment = sanitizeSegment(target, "image");
  const nameSegment = sanitizeSegment(String(fileName || "").replace(/\.[a-z0-9]+$/i, ""), "upload");
  const extension = extensionFromName(fileName) || extensionFromType(fileType);
  return `newsletters/${slugSegment}/${targetSegment}/${Date.now()}-${nameSegment}${extension}`;
}

export function buildNewsletterImageUrl(key) {
  return `/api/r2?key=${encodeURIComponent(String(key || "").trim())}`;
}