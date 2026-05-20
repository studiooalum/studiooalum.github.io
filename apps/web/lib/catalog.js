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

export function slugifyBaseName(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  return normalized
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "") || "product";
}

export function computeFinalPrice(product) {
  const price = Number(product?.price) || 0;
  const discountRate = Number(product?.discountRate) || 0;
  return discountRate > 0 ? Math.round(price * (1 - discountRate / 100)) : price;
}

export function pickRepresentativeEdition(editions) {
  const safeEditions = Array.isArray(editions) ? editions : [];

  return safeEditions.find((edition) => edition?.isRepresentative) || safeEditions[0] || null;
}

export function groupProductsByBaseName(products) {
  const groups = new Map();

  for (const product of products || []) {
    const { baseName } = parseProductTitle(product?.title);
    if (!baseName) continue;

    if (!groups.has(baseName)) groups.set(baseName, []);
    groups.get(baseName).push(product);
  }

  return Array.from(groups.entries()).map(([baseName, editions]) => ({
    baseName,
    baseSlug: slugifyBaseName(baseName),
    editions,
    representative: pickRepresentativeEdition(editions),
    tags: Array.from(new Set(editions.flatMap((item) => getProductTags(item)))),
  }));
}