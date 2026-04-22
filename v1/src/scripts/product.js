import client from "./sanity/client.js";
import { ALL_PRODUCTS_QUERY } from "./sanity/queries.js";
import { imageUrl } from "./sanity/image.js";
import { formatPrice, getFirstParagraph, parseProductTitle } from "./utils/catalog.js";

const params = new URLSearchParams(window.location.search);
const productName = params.get("product");
const inV1Shell = window.location.pathname.includes("/v1/");

function getShopPath() {
  return inV1Shell ? "../shop.html" : "./shop.html";
}

function getEditionPath(slug) {
  const encoded = encodeURIComponent(slug || "");
  return `./edition.html?slug=${encoded}`;
}

if (!productName) window.location.href = getShopPath();

const titleEl = document.getElementById("productTitle");
const introEl = document.getElementById("productIntro");
const metaEl = document.getElementById("productMeta");
const gridEl = document.getElementById("editionGrid");
const backEl = document.getElementById("productBack");

function renderEditionGrid(editions) {
  const representative = editions[0];
  const price = Number(representative.price) || 0;
  const discountRate = Number(representative.discountRate) || 0;
  const availableCount = editions.filter((e) => !e.soldOut).length;

  document.title = `${productName} Editions — Studio OALUM`;
  titleEl.textContent = productName;
  introEl.textContent = getFirstParagraph(representative.description || "상품 소개");

  if (discountRate > 0) {
    const discounted = Math.round(price * (1 - discountRate / 100));
    metaEl.innerHTML = [
      `<span class="product-meta__count">총 ${editions.length}개</span>`,
      `<span class="product-meta__original">${formatPrice(price)}</span>`,
      `<span class="product-meta__current">${formatPrice(discounted)}</span>`,
      `<span class="product-meta__discount">-${discountRate}%</span>`,
    ].join("");
  } else {
    metaEl.innerHTML = [
      `<span class="product-meta__count">총 ${editions.length}개</span>`,
      `<span class="product-meta__current">${formatPrice(price)}</span>`,
    ].join("");
  }
  if (availableCount === 0) {
    metaEl.insertAdjacentHTML("beforeend", `<span class="product-meta__count">전체 품절</span>`);
  }

  gridEl.innerHTML = "";

  for (const edition of editions) {
    const { editionLabel } = parseProductTitle(edition.title);
    const slug = edition.slug?.current || "";
    const sold = !!edition.soldOut;

    const link = document.createElement("a");
    link.className = sold ? "edition-card is-sold" : "edition-card";
    link.href = getEditionPath(slug);
    link.setAttribute("aria-label", editionLabel || edition.title);

    const thumb = document.createElement("div");
    thumb.className = "edition-card__thumb";

    if (!sold) {
      const firstImage =
        Array.isArray(edition.images) && edition.images.length > 0
          ? imageUrl(edition.images[0], { width: 720, height: 720 })
          : null;

      if (firstImage) {
        const img = document.createElement("img");
        img.src = firstImage;
        img.alt = editionLabel || edition.title;
        img.loading = "lazy";
        img.draggable = false;
        thumb.appendChild(img);
      } else {
        const empty = document.createElement("span");
        empty.className = "edition-card__sold";
        empty.textContent = "IMAGE";
        thumb.appendChild(empty);
      }
    }

    const no = document.createElement("div");
    no.className = "edition-card__no";
    no.textContent = editionLabel || edition.title;

    link.appendChild(thumb);
    link.appendChild(no);
    gridEl.appendChild(link);
  }
}

async function init() {
  try {
    gridEl.innerHTML = `<p class="product-state">Loading editions...</p>`;
    const allProducts = await client.fetch(ALL_PRODUCTS_QUERY);
    const editions = (allProducts || []).filter((p) => {
      const { baseName } = parseProductTitle(p.title);
      return baseName === productName;
    });

    if (backEl) {
      backEl.href = `./shop.html`;
    }

    if (editions.length === 0) {
      gridEl.innerHTML = `<p class="product-state">상품을 찾을 수 없습니다.</p>`;
      return;
    }
    renderEditionGrid(editions);
  } catch (err) {
    console.error("Failed to load product editions", err);
    gridEl.innerHTML = `<p class="product-state">상품을 불러오지 못했습니다.</p>`;
  }
}

init();