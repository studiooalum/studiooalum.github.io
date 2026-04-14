import client from "./sanity/client.js";
import { PRODUCT_BY_SLUG_QUERY } from "./sanity/queries.js";
import { imageUrl } from "./sanity/image.js";
const params = new URLSearchParams(window.location.search);
const slug = params.get("slug");

if (!slug) window.location.href = "../shop.html";

const titleEl = document.getElementById("productTitle");
const introEl = document.getElementById("productIntro");
const metaEl = document.getElementById("productMeta");
const gridEl = document.getElementById("editionGrid");

function padNo(n) {
  return String(n).padStart(2, "0");
}

function renderEditionGrid(product) {
  const title = product.title || "Product";
  const price = Number(product.price) || 0;
  const editionTotal = Number(product.editionTotal) > 0 ? Number(product.editionTotal) : 20;
  const soldSet = new Set((Array.isArray(product.soldNumbers) ? product.soldNumbers : []).map((n) => Number(n)));
  const allSold = !!product.soldOut;

  document.title = `${title} Editions — Studio OALUM`;
  titleEl.textContent = title;
  introEl.textContent = product.description || "상품 소개";
  metaEl.textContent = `총 ${editionTotal}개 · 개당 ₩${price.toLocaleString("ko-KR")}`;

  const firstImage = Array.isArray(product.images) && product.images.length > 0
    ? imageUrl(product.images[0], { width: 720, height: 720 })
    : null;

  gridEl.innerHTML = "";

  for (let i = 1; i <= editionTotal; i += 1) {
    const sold = allSold || soldSet.has(i);
    const link = document.createElement("a");
    link.className = sold ? "edition-card is-sold" : "edition-card";
    link.href = `./edition.html?slug=${encodeURIComponent(slug)}&no=${i}`;
    link.setAttribute("aria-label", `${title} #${padNo(i)}`);

    const thumb = document.createElement("div");
    thumb.className = "edition-card__thumb";

    if (sold) {
      const soldMark = document.createElement("span");
      soldMark.className = "edition-card__sold";
      soldMark.textContent = "SOLD";
      thumb.appendChild(soldMark);
    } else if (firstImage) {
      const img = document.createElement("img");
      img.src = firstImage;
      img.alt = `${title} #${padNo(i)}`;
      img.loading = "lazy";
      img.draggable = false;
      thumb.appendChild(img);
    } else {
      const empty = document.createElement("span");
      empty.className = "edition-card__sold";
      empty.textContent = "IMAGE";
      thumb.appendChild(empty);
    }

    const no = document.createElement("div");
    no.className = "edition-card__no";
    no.textContent = `#${padNo(i)}`;

    link.appendChild(thumb);
    link.appendChild(no);
    gridEl.appendChild(link);
  }
}

async function init() {
  try {
    gridEl.innerHTML = `<p class="product-state">Loading editions...</p>`;
    const product = await client.fetch(PRODUCT_BY_SLUG_QUERY, { slug });
    if (!product) {
      gridEl.innerHTML = `<p class="product-state">상품을 찾을 수 없습니다.</p>`;
      return;
    }
    renderEditionGrid(product);
  } catch (err) {
    console.error("Failed to load product editions", err);
    gridEl.innerHTML = `<p class="product-state">상품을 불러오지 못했습니다.</p>`;
  }
}

init();