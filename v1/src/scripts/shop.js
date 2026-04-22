import client from "./sanity/client.js";
import { ALL_PRODUCTS_QUERY } from "./sanity/queries.js";
import { imageUrl } from "./sanity/image.js";

const SHOP_TAGS = [
  { value: "all", label: "all" },
  { value: "accessories", label: "accessories" },
  { value: "clothing", label: "clothing" },
  { value: "hat", label: "hat" },
  { value: "home", label: "home" },
];

function formatPrice(n) {
  if (n !== 0 && !n) return "";
  return `₩${Number(n).toLocaleString("ko-KR")}`;
}

/** Split "Patchwork Cable Beanie (Cream #01)" → { baseName, editionLabel } */
function parseProductTitle(title) {
  const m = (title || "").match(/^(.+?)\s*\((.+)\)\s*$/);
  if (m) return { baseName: m[1].trim(), editionLabel: m[2].trim() };
  return { baseName: (title || "").trim(), editionLabel: null };
}

/** Group products by base name. Returns Map<baseName, product[]> */
function groupProducts(products) {
  const groups = new Map();
  for (const p of products) {
    const { baseName } = parseProductTitle(p.title);
    if (!groups.has(baseName)) groups.set(baseName, []);
    groups.get(baseName).push(p);
  }
  return groups;
}

function normalizeTag(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "accessory") return "accessories";
  return raw;
}

function getProductTags(product) {
  const tags = new Set();

  if (Array.isArray(product.shopTags)) {
    product.shopTags.forEach((tag) => {
      const normalized = normalizeTag(tag);
      if (normalized) tags.add(normalized);
    });
  }

  const categoryTag = normalizeTag(product.category);
  if (categoryTag) tags.add(categoryTag);

  return Array.from(tags);
}

const gridEl = document.getElementById("shopGrid");
const tagsEl = document.getElementById("shopTags");
const inV1Shell = window.location.pathname.includes("/v1/");
const activeTag = normalizeTag(new URLSearchParams(window.location.search).get("tag")) || "all";

function getProductPath(baseName) {
  const encoded = encodeURIComponent(baseName);
  return inV1Shell
    ? `./src/product.html?product=${encoded}`
    : `./product.html?product=${encoded}`;
}

function getShopPath(tag) {
  const target = tag && tag !== "all" ? `./shop.html?tag=${encodeURIComponent(tag)}` : "./shop.html";
  return inV1Shell ? target.replace("./", "../") : target;
}

if (!gridEl || !tagsEl) {
  throw new Error("Shop DOM is missing required shop layout elements.");
}

function createProductCard(baseName, editions, index) {
  const representative = editions[0]; // first edition (#01) is the representative
  const card = document.createElement("a");
  card.className = "shop-card";
  card.href = getProductPath(baseName);

  const thumb = document.createElement("div");
  thumb.className = "shop-card__thumb";

  const firstImage =
    Array.isArray(representative.images) && representative.images.length > 0
      ? imageUrl(representative.images[0], { width: 720, height: 720 })
      : null;

  if (firstImage) {
    const img = document.createElement("img");
    img.src = firstImage;
    img.alt = baseName;
    img.loading = "lazy";
    img.draggable = false;
    thumb.appendChild(img);
  } else {
    const fallback = document.createElement("span");
    fallback.className = "shop-card__fallback";
    fallback.textContent = "NO IMAGE";
    thumb.appendChild(fallback);
  }

  const body = document.createElement("div");
  body.className = "shop-card__body";

  const title = document.createElement("h3");
  title.className = "shop-card__title";
  title.textContent = baseName;

  const meta = document.createElement("div");
  meta.className = "shop-card__meta";

  // Price with discount
  const price = representative.price;
  const discountRate = Number(representative.discountRate) || 0;

  if (discountRate > 0) {
    const discounted = Math.round(price * (1 - discountRate / 100));
    const originalSpan = document.createElement("span");
    originalSpan.className = "shop-card__price--original";
    originalSpan.textContent = formatPrice(price);
    meta.appendChild(originalSpan);

    const discountedSpan = document.createElement("span");
    discountedSpan.className = "shop-card__price";
    discountedSpan.textContent = formatPrice(discounted);
    meta.appendChild(discountedSpan);

    const badge = document.createElement("span");
    badge.className = "shop-card__discount";
    badge.textContent = `-${discountRate}%`;
    meta.appendChild(badge);
  } else {
    const priceSpan = document.createElement("span");
    priceSpan.textContent = formatPrice(price);
    meta.appendChild(priceSpan);
  }

  const editionSpan = document.createElement("span");
  editionSpan.textContent = `${editions.length} editions`;
  meta.appendChild(editionSpan);

  body.appendChild(title);
  body.appendChild(meta);
  card.appendChild(thumb);
  card.appendChild(body);
  return card;
}

function renderTags() {
  tagsEl.innerHTML = "";

  for (const tag of SHOP_TAGS) {
    const link = document.createElement("a");
    link.className = tag.value === activeTag ? "shop-tag is-active" : "shop-tag";
    link.href = getShopPath(tag.value);
    link.textContent = tag.label;
    tagsEl.appendChild(link);
  }
}

function renderProducts(products) {
  const safeProducts = Array.isArray(products) ? products : [];
  const filteredProducts =
    activeTag === "all"
      ? safeProducts
      : safeProducts.filter((product) => getProductTags(product).includes(activeTag));
  const groups = groupProducts(filteredProducts);

  gridEl.innerHTML = "";

  if (groups.size === 0) {
    gridEl.innerHTML = `<p class="shop-state">등록된 상품이 없습니다.</p>`;
    return;
  }

  let index = 0;
  for (const [baseName, editions] of groups) {
    gridEl.appendChild(createProductCard(baseName, editions, index));
    index += 1;
  }
}

async function init() {
  try {
    renderTags();
    gridEl.innerHTML = `<p class="shop-state">Loading products...</p>`;
    const products = await client.fetch(ALL_PRODUCTS_QUERY);
    renderProducts(products);
  } catch (err) {
    console.error("Failed to fetch products", err);
    gridEl.innerHTML = `<p class="shop-state">상품을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>`;
  }
}

init();
