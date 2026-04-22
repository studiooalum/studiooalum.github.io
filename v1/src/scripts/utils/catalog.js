export function parseProductTitle(title) {
  const match = String(title || "").match(/^(.+?)\s*\((.+)\)\s*$/);
  if (match) {
    return {
      baseName: match[1].trim(),
      editionLabel: match[2].trim(),
    };
  }

  return {
    baseName: String(title || "").trim(),
    editionLabel: null,
  };
}

export function formatPrice(value) {
  if (value !== 0 && !value) return "";
  return `₩${Number(value).toLocaleString("ko-KR")}`;
}

export function normalizeShopTag(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "accessory") return "accessories";
  return raw;
}

export function getProductTags(product) {
  const tags = new Set();

  if (Array.isArray(product?.shopTags)) {
    for (const tag of product.shopTags) {
      const normalized = normalizeShopTag(tag);
      if (normalized) tags.add(normalized);
    }
  }

  const categoryTag = normalizeShopTag(product?.category);
  if (categoryTag) tags.add(categoryTag);

  return Array.from(tags);
}

export function getFirstParagraph(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";

  const parts = normalized.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  return parts[0] || normalized;
}