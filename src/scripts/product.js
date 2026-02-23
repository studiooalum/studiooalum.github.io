console.log("📦 product.js loaded");

import client from "./sanity/client.js";
import { PRODUCT_BY_SLUG_QUERY } from "./sanity/queries.js";
import { urlFor } from "./sanity/image.js";

/* =========================
   GET SLUG FROM URL
========================= */
const params = new URLSearchParams(window.location.search);
const slug = params.get("slug");

if (!slug) {
  window.location.href = "./shop.html";
}

/* =========================
   DOM REFS
========================= */
const loadingEl     = document.getElementById("productLoading");
const layoutEl      = document.getElementById("productLayout");
const mainImageEl   = document.getElementById("mainImage");
const thumbStripEl  = document.getElementById("thumbStrip");
const titleEl       = document.getElementById("productTitle");
const priceEl       = document.getElementById("productPrice");
const badgeEl       = document.getElementById("productBadge");
const categoryEl    = document.getElementById("productCategory");
const descriptionEl = document.getElementById("productDescription");

/* =========================
   HELPERS
========================= */
function formatPrice(n) {
  if (!n && n !== 0) return "";
  return "₩" + n.toLocaleString("ko-KR");
}

/* =========================
   RENDER PRODUCT
========================= */
function renderProduct(product) {
  // Title
  document.title = `${product.title} — Studio OALUM`;
  titleEl.textContent = product.title;

  // Price
  priceEl.textContent = formatPrice(product.price);

  // Sold out badge
  if (product.soldOut) {
    badgeEl.style.display = "inline-block";
  }

  // Category
  if (product.category) {
    categoryEl.textContent = product.category.charAt(0).toUpperCase() + product.category.slice(1);
  }

  // Description
  descriptionEl.textContent = product.description || "";

  // Images
  if (product.images && product.images.length > 0) {
    const firstUrl = urlFor(product.images[0]).width(800).url();
    mainImageEl.src = firstUrl;
    mainImageEl.alt = product.title;

    // Thumbnail strip
    product.images.forEach((img, i) => {
      const thumbUrl = urlFor(img).width(160).height(160).url();
      const thumb = document.createElement("img");
      thumb.src = thumbUrl;
      thumb.alt = `${product.title} image ${i + 1}`;
      thumb.classList.add("product-gallery__thumb");
      if (i === 0) thumb.classList.add("is-active");
      thumb.draggable = false;

      thumb.addEventListener("click", () => {
        mainImageEl.src = urlFor(img).width(800).url();
        thumbStripEl.querySelectorAll(".product-gallery__thumb").forEach((t) =>
          t.classList.remove("is-active")
        );
        thumb.classList.add("is-active");
      });

      thumbStripEl.appendChild(thumb);
    });
  }

  // Show content, hide loader
  loadingEl.style.display = "none";
  layoutEl.style.display = "";
}

/* =========================
   FETCH
========================= */
client
  .fetch(PRODUCT_BY_SLUG_QUERY, { slug })
  .then((product) => {
    if (!product) {
      console.warn("Product not found for slug:", slug);
      loadingEl.innerHTML = `<p style="text-align:center;font-family:var(--font-base);color:#888;">Product not found.</p>`;
      return;
    }
    console.log("📦 Product loaded:", product.title);
    renderProduct(product);
  })
  .catch((err) => {
    console.error("❌ Failed to load product:", err);
    loadingEl.innerHTML = `<p style="text-align:center;font-family:var(--font-base);color:#888;">Failed to load product.</p>`;
  });