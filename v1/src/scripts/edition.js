import client from "./sanity/client.js";
import { PRODUCT_BY_SLUG_QUERY } from "./sanity/queries.js";
import { imageUrl } from "./sanity/image.js";
import { addToCart, addToCartSilent } from "./cart.js";

const params = new URLSearchParams(window.location.search);
const slug = params.get("slug");
const inV1Shell = window.location.pathname.includes("/v1/");

function getShopPath() {
  return inV1Shell ? "../shop.html" : "./shop.html";
}

if (!slug) {
  window.location.href = getShopPath();
}

/** Split "Patchwork Cable Beanie (Cream #01)" → { baseName, editionLabel } */
function parseProductTitle(title) {
  const m = (title || "").match(/^(.+?)\s*\((.+)\)\s*$/);
  if (m) return { baseName: m[1].trim(), editionLabel: m[2].trim() };
  return { baseName: (title || "").trim(), editionLabel: null };
}

const mediaEl = document.getElementById("editionMedia");
const titleEl = document.getElementById("editionTitle");
const priceEl = document.getElementById("editionPrice");
const sizeEl = document.getElementById("editionSize");
const descEl = document.getElementById("editionDesc");
const addBtn = document.getElementById("addToCartBtn");
const buyBtn = document.getElementById("buyNowBtn");
const noteEl = document.getElementById("editionNote");
const backEl = document.getElementById("editionBack");

function formatPrice(n) {
  if (n !== 0 && !n) return "";
  return `₩${Number(n).toLocaleString("ko-KR")}`;
}

function resolveSize(product) {
  if (product.size) return product.size;
  if (product.dimensions) return product.dimensions;
  return "One Size / 상세 문의";
}

function markSold() {
  document.body.classList.add("is-sold");
  mediaEl.classList.add("is-sold");
  mediaEl.innerHTML = `<span class="edition-media__sold">SOLD</span>`;
  noteEl.textContent = "판매 완료된 에디션입니다. 다른 에디션을 확인해보세요.";
}

function renderMedia(product) {
  if (product.soldOut) {
    markSold();
    return;
  }

  const firstImage = Array.isArray(product.images) && product.images.length > 0
    ? imageUrl(product.images[0], { width: 1000, height: 1000 })
    : null;

  if (!firstImage) {
    mediaEl.innerHTML = "";
    return;
  }

  const img = document.createElement("img");
  img.src = firstImage;
  img.alt = product.title;
  img.draggable = false;
  mediaEl.appendChild(img);
}

function toCheckoutWith(product) {
  addToCartSilent(product);
  window.location.href = "./checkout.html";
}

async function init() {
  try {
    const product = await client.fetch(PRODUCT_BY_SLUG_QUERY, { slug });
    if (!product) {
      titleEl.textContent = "상품을 찾을 수 없습니다";
      addBtn.style.display = "none";
      buyBtn.style.display = "none";
      return;
    }

    const { baseName, editionLabel } = parseProductTitle(product.title);
    const displayTitle = editionLabel || product.title;
    const sold = !!product.soldOut;

    // Back link → product page for the base product
    backEl.href = `./product.html?product=${encodeURIComponent(baseName)}`;

    document.title = `${product.title} — Studio OALUM`;
    titleEl.textContent = displayTitle;
    sizeEl.textContent = `Size: ${resolveSize(product)}`;
    descEl.textContent = product.description || "제품 정보";

    // Price with discount
    const price = Number(product.price) || 0;
    const discountRate = Number(product.discountRate) || 0;

    if (discountRate > 0) {
      const discounted = Math.round(price * (1 - discountRate / 100));
      priceEl.innerHTML = `<span class="price-original">${formatPrice(price)}</span> ${formatPrice(discounted)} <span class="discount-badge">-${discountRate}%</span>`;
    } else {
      priceEl.textContent = formatPrice(price);
    }

    renderMedia(product);

    if (sold) return;

    const cartItem = { ...product };
    addBtn.addEventListener("click", () => addToCart(cartItem));
    buyBtn.addEventListener("click", () => toCheckoutWith(cartItem));
  } catch (err) {
    console.error("Failed to load edition", err);
    titleEl.textContent = "상품 정보를 불러오지 못했습니다";
    addBtn.style.display = "none";
    buyBtn.style.display = "none";
  }
}

init();
