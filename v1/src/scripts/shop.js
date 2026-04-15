import client from "./sanity/client.js";
import { ALL_PRODUCTS_QUERY } from "./sanity/queries.js";
import { imageUrl } from "./sanity/image.js";

function formatPrice(n) {
  if (n !== 0 && !n) return "";
  return `₩${Number(n).toLocaleString("ko-KR")}`;
}

const gridEl = document.getElementById("shopGrid");
const introCountEl = document.getElementById("shopCount");
const inV1Shell = window.location.pathname.includes("/v1/");

function getProductPath(slug) {
  const encoded = encodeURIComponent(slug || "");
  return inV1Shell
    ? `./src/product.html?slug=${encoded}`
    : `./product.html?slug=${encoded}`;
}

function pickSizeClass(product, index) {
  const title = String(product?.title || "").toLowerCase();
  if (title.includes("rug")) return "shop-card--hero";
  const variants = ["shop-card--tall", "shop-card--square", "shop-card--wide", "shop-card--square"];
  return variants[index % variants.length];
}

if (!gridEl || !introCountEl) {
  throw new Error("Shop DOM is missing required #shopGrid or #shopCount element.");
}

function createProductCard(product, index) {
  const slug = product?.slug?.current || "";
  const card = document.createElement("a");
  card.className = `shop-card ${pickSizeClass(product, index)}`;
  card.href = getProductPath(slug);

  const thumb = document.createElement("div");
  thumb.className = "shop-card__thumb";

  const firstImage = Array.isArray(product.images) && product.images.length > 0
    ? imageUrl(product.images[0], { width: 720, height: 720 })
    : null;

  if (firstImage) {
    const img = document.createElement("img");
    img.src = firstImage;
    img.alt = product.title || "product";
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
  title.textContent = product.title || "Untitled";

  const meta = document.createElement("div");
  meta.className = "shop-card__meta";

  const price = document.createElement("span");
  price.textContent = formatPrice(product.price);
  meta.appendChild(price);

  const editionCount = Number(product.editionTotal) > 0 ? Number(product.editionTotal) : 20;
  const edition = document.createElement("span");
  edition.textContent = `${editionCount} editions`;
  meta.appendChild(edition);

  body.appendChild(title);
  body.appendChild(meta);

  card.appendChild(thumb);
  card.appendChild(body);
  return card;
}

function renderProducts(products) {
  const safeProducts = Array.isArray(products) ? products : [];
  introCountEl.textContent = `${safeProducts.length} products`;
  gridEl.innerHTML = "";

  safeProducts.forEach((product, index) => {
    gridEl.appendChild(createProductCard(product, index));
  });
}

async function init() {
  try {
    gridEl.innerHTML = `<p class="shop-state">Loading products...</p>`;
    const products = await client.fetch(ALL_PRODUCTS_QUERY);
    renderProducts(products);
  } catch (err) {
    console.error("Failed to fetch products", err);
    gridEl.innerHTML = `<p class="shop-state">상품을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>`;
  }
}

init();
