console.log("🔥 shop.js loaded");

import client from "./sanity/client.js";
import { ALL_PRODUCTS_QUERY } from "./sanity/queries.js";
import { imageUrl } from "./sanity/image.js";
import { buildRugPatches } from "../data/rugPatches.js";

/* =========================
   HELPERS
========================= */

function formatPrice(n) {
  if (!n && n !== 0) return "";
  return "₩" + n.toLocaleString("ko-KR");
}

/* =========================
   DOM
========================= */
const track = document.getElementById("rugTrack");
track.classList.add("is-loading");

let lastProducts = [];

/* =========================
   RENDER
========================= */
function renderRug(patches) {
  track.innerHTML = "";

  patches.forEach((patch) => {
    const el = document.createElement("div");
    el.classList.add("patch");

    /* ========================= PRODUCT ========================= */
    if (patch._gridProduct) {
      el.classList.add("kind-product");
      el.style.gridColumn = "span 1";
      el.style.gridRow = "span 2";
      el.style.gridRowStart = "2";
      el.dataset.id = patch._id || "";

      const imgUrl = patch.images && patch.images.length > 0
        ? imageUrl(patch.images[0], { width: 400 })
        : null;

      if (imgUrl) {
        const img = document.createElement("img");
        img.src = imgUrl;
        img.alt = patch.title || "";
        img.draggable = false;
        img.loading = "lazy";
        el.appendChild(img);

        // Info overlay
        const info = document.createElement("div");
        info.classList.add("patch__info");

        const title = document.createElement("div");
        title.classList.add("patch__info-title");
        title.textContent = patch.title || "";
        info.appendChild(title);

        if (patch.price) {
          const price = document.createElement("div");
          price.classList.add("patch__info-price");
          price.textContent = formatPrice(patch.price);
          info.appendChild(price);
        }

        if (patch.soldOut) {
          const badge = document.createElement("span");
          badge.classList.add("patch__sold-out");
          badge.textContent = "Sold Out";
          info.appendChild(badge);
        }

        el.appendChild(info);
      } else {
        el.classList.add("is-loading");
      }

      el.dataset.link = `./src/product.html?slug=${patch.slug?.current || ""}`;
    }

    /* ========================= SOLID / FILLER ========================= */
    else {
      el.classList.add(`kind-${patch.kind}`);
      el.style.gridColumn = `span ${patch.span || 1}`;
      el.style.gridRow = `span ${patch.height || 1}`;

      if (patch.kind === "solid") {
        el.style.setProperty("--patch-color", patch.color || "#e8e4d9");
        if (patch.fabric) el.classList.add(`fabric-${patch.fabric}`);
      }

      if (patch.kind === "pattern") {
        el.classList.add(`pattern-${patch.patternType || "default"}`);
      }
    }

    track.appendChild(el);
  });

  track.classList.remove("is-loading");
  track.classList.add("is-ready");
}

/* =========================
   FETCH & INIT
========================= */

renderRug(buildRugPatches([]));

client
  .fetch(ALL_PRODUCTS_QUERY)
  .then((products) => {
    console.log(`📦 Fetched ${products.length} product(s) from Sanity`);
    lastProducts = Array.isArray(products) ? products : [];
    renderRug(buildRugPatches(lastProducts));
  })
  .catch((err) => {
    console.warn("⚠️ Sanity fetch failed, showing decorative rug:", err);
  });

window.addEventListener("resize", () => {
  renderRug(buildRugPatches(lastProducts));
});

/* =========================
   PHYSICS — Smooth Drag & Scroll + Mobile Momentum
========================= */
let currentX = 0;
let targetX = 0;
let isDragging = false;
let startX = 0;
let lastX = 0;

let dragStartX = 0;
let dragStartTime = 0;
let isClick = true;

const friction = 0.08;
const CLICK_THRESHOLD = 8;         // px — movement below this counts as a click
const MOMENTUM_MULTIPLIER = 0.92;  // velocity decay per frame (higher = more slide)
let velocityX = 0;
let lastMoveX = 0;
let lastMoveTime = 0;

const getMaxScroll = () => Math.max(0, track.scrollWidth - window.innerWidth);

/* ---- Wheel ---- */
const handleWheel = (e) => {
  targetX += e.deltaY + e.deltaX;
  targetX = Math.max(0, Math.min(targetX, getMaxScroll()));
};

/* ---- Pointer down ---- */
const handleDown = (e) => {
  isDragging = true;
  isClick = true;
  velocityX = 0;

  const pageX = e.pageX ?? e.touches?.[0]?.pageX ?? 0;
  startX = pageX;
  dragStartX = pageX;
  dragStartTime = Date.now();
  lastMoveX = pageX;
  lastMoveTime = dragStartTime;
  lastX = targetX;

  track.parentElement.style.cursor = "grabbing";
};

/* ---- Pointer move ---- */
const handleMove = (e) => {
  if (!isDragging) return;

  const pageX = e.pageX ?? e.touches?.[0]?.pageX ?? 0;
  const now = Date.now();

  if (Math.abs(pageX - dragStartX) > CLICK_THRESHOLD) {
    isClick = false;
  }

  // Track velocity for momentum
  const dt = now - lastMoveTime;
  if (dt > 0) {
    velocityX = (lastMoveX - pageX) / dt; // px/ms
  }
  lastMoveX = pageX;
  lastMoveTime = now;

  const walk = (pageX - startX) * 1.5;
  targetX = lastX - walk;
  targetX = Math.max(0, Math.min(targetX, getMaxScroll()));
};

/* ---- Pointer up ---- */
const handleUp = (e) => {
  isDragging = false;
  track.parentElement.style.cursor = "grab";

  // Apply momentum (flick gesture)
  const flickDuration = Date.now() - dragStartTime;
  if (!isClick && flickDuration < 300 && Math.abs(velocityX) > 0.3) {
    targetX += velocityX * 600; // project forward
    targetX = Math.max(0, Math.min(targetX, getMaxScroll()));
  }

  if (isClick) {
    const target = e.target || e.changedTouches?.[0]?.target;
    const productEl = target?.closest(".kind-product");
    if (productEl && productEl.dataset.link) {
      window.location.href = productEl.dataset.link;
    }
  }
};

// Bind events
window.addEventListener("wheel", handleWheel, { passive: true });
window.addEventListener("mousedown", handleDown);
window.addEventListener("touchstart", handleDown, { passive: true });
window.addEventListener("mousemove", handleMove);
window.addEventListener("touchmove", handleMove, { passive: true });
window.addEventListener("mouseup", handleUp);
window.addEventListener("touchend", handleUp);

// Prevent context menu on long-press (mobile UX)
track.addEventListener("contextmenu", (e) => e.preventDefault());

/* ---- Animation loop ---- */
function animate() {
  currentX += (targetX - currentX) * friction;
  track.style.transform = `translateX(${-currentX.toFixed(2)}px)`;
  requestAnimationFrame(animate);
}

animate();
