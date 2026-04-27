import client from "./sanity/client.js";
import { ALL_PRODUCTS_QUERY, PRODUCT_BY_SLUG_QUERY } from "./sanity/queries.js";
import { imageUrl } from "./sanity/image.js";
import { addToCart, addToCartSilent } from "./cart.js";
import { formatPrice, getProductTags, parseProductTitle } from "./utils/catalog.js";

const params = new URLSearchParams(window.location.search);
const slug = params.get("slug");

function getShopPath() {
  return "./shop.html";
}

if (!slug) {
  window.location.href = getShopPath();
}

const mediaEl = document.getElementById("editionMedia");
const detailsEl = document.getElementById("editionDetails");
const detailsStickyEl = document.getElementById("editionDetailsSticky");
const kickerEl = document.getElementById("editionKicker");
const titleEl = document.getElementById("editionTitle");
const numberEl = document.getElementById("editionNumber");
const priceEl = document.getElementById("editionPrice");
const descEl = document.getElementById("editionDesc");
const tagsEl = document.getElementById("editionTags");
const recommendGridEl = document.getElementById("recommendGrid");
const addBtn = document.getElementById("addToCartBtn");
const buyBtn = document.getElementById("buyNowBtn");
const noteEl = document.getElementById("editionNote");
const backEl = document.getElementById("editionBack");

function renderEditionPrice(price, discountRate) {
  if (!priceEl) return;

  priceEl.replaceChildren();

  if (discountRate > 0) {
    const discounted = Math.round(price * (1 - discountRate / 100));

    const originalSpan = document.createElement("span");
    originalSpan.className = "shop-card__price--original";
    originalSpan.textContent = formatPrice(price);

    const discountedSpan = document.createElement("span");
    discountedSpan.className = "shop-card__price";
    discountedSpan.textContent = formatPrice(discounted);

    const badge = document.createElement("span");
    badge.className = "shop-card__discount";
    badge.textContent = `-${discountRate}%`;

    priceEl.append(originalSpan, discountedSpan, badge);
    return;
  }

  const priceSpan = document.createElement("span");
  priceSpan.className = "shop-card__price";
  priceSpan.textContent = formatPrice(price);
  priceEl.appendChild(priceSpan);
}

function syncStickyStop() {
  if (!detailsEl || !detailsStickyEl) return;

  if (window.innerWidth < 960) {
    detailsEl.style.removeProperty("height");
    return;
  }

  const mediaImages = mediaEl.querySelectorAll("img");
  const stickyHeight = Math.ceil(detailsStickyEl.offsetHeight);

  if (mediaImages.length <= 1) {
    detailsEl.style.height = `${stickyHeight}px`;
    return;
  }

  const lastImage = mediaImages[mediaImages.length - 1];
  const stopOffset = Math.ceil(lastImage.offsetTop + stickyHeight);
  detailsEl.style.height = `${Math.max(stickyHeight, stopOffset)}px`;
}

function bindStickyStopUpdates() {
  if (!detailsEl || !detailsStickyEl) return;

  const mediaImages = mediaEl.querySelectorAll("img");
  for (const image of mediaImages) {
    if (image.complete) continue;
    image.addEventListener("load", syncStickyStop, { once: true });
  }

  window.addEventListener("resize", syncStickyStop);

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(syncStickyStop);
    observer.observe(mediaEl);
    observer.observe(detailsStickyEl);
  }

  requestAnimationFrame(syncStickyStop);
}

function markSold() {
  document.body.classList.add("is-sold");
  mediaEl.classList.add("is-sold");
  mediaEl.innerHTML = `<span class="edition-media__sold"></span>`;
  noteEl.textContent = "판매 완료된 에디션입니다. 다른 에디션을 확인해보세요.";
}

function renderTags(product) {
  const tags = getProductTags(product);
  tagsEl.innerHTML = "";

  if (tags.length === 0) return;

  for (const tag of tags) {
    const link = document.createElement("a");
    link.className = "edition-tag";
    link.href = `./shop.html?tag=${encodeURIComponent(tag)}`;
    link.textContent = tag;
    tagsEl.appendChild(link);
  }
}

function renderMedia(product) {
  if (product.soldOut) {
    markSold();
    syncStickyStop();
    return;
  }

  const images = Array.isArray(product.images) ? product.images : [];
  if (images.length === 0) {
    mediaEl.innerHTML = "";
    syncStickyStop();
    return;
  }

  // Main image
  const mainImg = document.createElement("img");
  mainImg.src = imageUrl(images[0], { width: 1000, height: 1000 });
  mainImg.alt = product.title;
  mainImg.draggable = false;
  mediaEl.appendChild(mainImg);

  // Detail images (additional images from Sanity)
  for (let i = 1; i < images.length; i++) {
    const img = document.createElement("img");
    img.src = imageUrl(images[i], { width: 1000 });
    img.alt = `${product.title} detail ${i}`;
    img.loading = "lazy";
    img.draggable = false;
    mediaEl.appendChild(img);
  }

  bindStickyStopUpdates();
}

function toCheckoutWith(product) {
  addToCartSilent(product);
  window.location.href = "./checkout.html";
}

function renderRecommendations(allProducts, currentBaseName) {
  const grouped = new Map();

  for (const item of allProducts || []) {
    const { baseName } = parseProductTitle(item.title);
    if (baseName === currentBaseName) continue;
    if (!grouped.has(baseName)) grouped.set(baseName, item);
  }

  const recommendations = Array.from(grouped.values()).slice(0, 4);
  recommendGridEl.innerHTML = "";

  for (const item of recommendations) {
    const { baseName } = parseProductTitle(item.title);
    const link = document.createElement("a");
    link.className = "edition-recommend-card";
    link.href = `./product.html?product=${encodeURIComponent(baseName)}`;

    const thumb = document.createElement("div");
    thumb.className = "edition-recommend-card__thumb";

    const firstImage = Array.isArray(item.images) && item.images.length > 0
      ? imageUrl(item.images[0], { width: 640, height: 640 })
      : null;

    if (firstImage) {
      const image = document.createElement("img");
      image.src = firstImage;
      image.alt = baseName;
      image.loading = "lazy";
      thumb.appendChild(image);
    }

    link.appendChild(thumb);
    recommendGridEl.appendChild(link);
  }
}

async function init() {
  try {
    const [product, allProducts] = await Promise.all([
      client.fetch(PRODUCT_BY_SLUG_QUERY, { slug }),
      client.fetch(ALL_PRODUCTS_QUERY),
    ]);

    if (!product) {
      titleEl.textContent = "상품을 찾을 수 없습니다";
      addBtn.style.display = "none";
      buyBtn.style.display = "none";
      return;
    }

    const { baseName, editionLabel } = parseProductTitle(product.title);
    const sold = !!product.soldOut;
    const tags = getProductTags(product);

    // Back link → product page for the base product
    backEl.href = `./product.html?product=${encodeURIComponent(baseName)}`;

    document.title = `${product.title} — Studio OALUM`;
    kickerEl.textContent = tags[0] || "edition";
    titleEl.textContent = baseName;
    numberEl.textContent = editionLabel || product.title;
    descEl.textContent = product.description || "제품 정보";
    renderTags(product);

    const price = Number(product.price) || 0;
    const discountRate = Number(product.discountRate) || 0;
    renderEditionPrice(price, discountRate);

    renderMedia(product);
    renderRecommendations(allProducts, baseName);

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
