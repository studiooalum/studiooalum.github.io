import client from "./sanity/client.js";
import { PRODUCT_BY_SLUG_QUERY } from "./sanity/queries.js";
import { imageUrl } from "./sanity/image.js";
import { addToCart } from "./cart.js";

const params = new URLSearchParams(window.location.search);
const slug = params.get("slug");
const editionNo = Number(params.get("no"));

if (!slug || !Number.isInteger(editionNo) || editionNo < 1) {
  window.location.href = "../shop.html";
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

function padNo(n) {
  return String(n).padStart(2, "0");
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
  noteEl.textContent = "판매 완료된 넘버링입니다. 다른 넘버링을 확인해보세요.";
}

function renderMedia(product, sold) {
  if (sold) {
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
  img.alt = `${product.title} #${padNo(editionNo)}`;
  img.draggable = false;
  mediaEl.appendChild(img);
}

function toCheckoutWith(product) {
  addToCart(product);
  window.location.href = "./checkout.html";
}

async function init() {
  backEl.href = `./product.html?slug=${encodeURIComponent(slug)}`;

  try {
    const product = await client.fetch(PRODUCT_BY_SLUG_QUERY, { slug });
    if (!product) {
      titleEl.textContent = "상품을 찾을 수 없습니다";
      addBtn.style.display = "none";
      buyBtn.style.display = "none";
      return;
    }

    const editionTotal = Number(product.editionTotal) > 0 ? Number(product.editionTotal) : 20;
    if (editionNo > editionTotal) {
      titleEl.textContent = "유효하지 않은 넘버링입니다";
      addBtn.style.display = "none";
      buyBtn.style.display = "none";
      noteEl.textContent = `이 상품은 #${String(editionTotal).padStart(2, "0")}까지 제공됩니다.`;
      return;
    }

    const soldSet = new Set((Array.isArray(product.soldNumbers) ? product.soldNumbers : []).map((n) => Number(n)));
    const sold = !!product.soldOut || soldSet.has(editionNo);

    document.title = `${product.title} #${padNo(editionNo)} — Studio OALUM`;
    titleEl.textContent = `${product.title} #${padNo(editionNo)}`;
    priceEl.textContent = formatPrice(product.price);
    sizeEl.textContent = `Size: ${resolveSize(product)}`;
    descEl.textContent = product.description || "제품 정보";

    const cartItem = {
      ...product,
      editionNumber: editionNo,
    };

    renderMedia(product, sold);

    if (sold) return;

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
