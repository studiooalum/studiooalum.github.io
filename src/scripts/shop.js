console.log("🔥 shop.js loaded");

import client from "./sanity/client.js";
import { ALL_PRODUCTS_QUERY } from "./sanity/queries.js";
import { urlFor } from "./sanity/image.js";

/* =========================
   CONSTANTS
========================= */
const ROWS = 4;
const MIN_FILLER_COLS = 2;  // filler columns on each side of a product

/* Muted, earthy fabric palette — realistic for patchwork */
const FABRIC_PALETTE = [
  "#e8e4d9", "#ddd8ca", "#d1c9b8", "#c7bfad",
  "#b5aa96", "#a89e8c", "#978b78", "#8c7e6a",
  "#7a6e5d", "#6b6052", "#5a4e42", "#4a4035",
  "#c4b8a8", "#d6cfc3", "#c2b5a0", "#b0a590",
  "#3b4d61", "#4a5a6d", "#5c6b7a",
  "#d1c4ae", "#bfb39d", "#a89b85",
];

/* Texture classes that map to CSS .fabric-* rules */
const FABRIC_TEXTURES = [
  "linen", "canvas", "tweed", "corduroy", "wool",
  "herringbone", "denim", "satin", "flannel", "knit", "velvet",
];

/* =========================
   HELPERS
========================= */

/** Deterministic-ish seeded random for consistent layouts per session */
function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rand = seededRandom(Date.now());

function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}

/** Format KRW price */
function formatPrice(n) {
  if (!n && n !== 0) return "";
  return "₩" + n.toLocaleString("ko-KR");
}

/* =========================
   BUILD PATCH GRID
   - Products are placed in spread-out columns
   - Remaining cells are filled with varied fabric patches
========================= */

function buildRugPatches(products) {
  const patches = [];

  if (!products || products.length === 0) {
    // No products yet — generate a pure decorative rug
    const cols = Math.max(8, Math.ceil(window.innerWidth / (window.innerHeight * 0.175)));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < ROWS; r++) {
        patches.push(makeFillerPatch());
      }
    }
    return patches;
  }

  // Each product occupies 1 col × 2 rows, placed at row 2 (visually centered)
  // Surround with filler columns for spacing
  const totalCols = products.length * (1 + MIN_FILLER_COLS) + MIN_FILLER_COLS;

  // Build a 2D grid (col-major, matching grid-auto-flow: column)
  const grid = Array.from({ length: totalCols }, () => Array(ROWS).fill(null));

  // Place products spread across columns
  const spacing = Math.floor(totalCols / products.length);
  products.forEach((product, i) => {
    const col = MIN_FILLER_COLS + i * spacing;
    if (col < totalCols) {
      // Spans rows 1–2 (0-indexed) — visually centered in the 4-row grid
      grid[col][1] = {
        kind: "product",
        id: product._id,
        span: 1,
        height: 2,
        productData: {
          title: product.title || "",
          image: product.images && product.images.length > 0
            ? urlFor(product.images[0]).width(400).url()
            : null,
          slug: product.slug,
          price: product.price,
          soldOut: product.soldOut || false,
          description: product.description || "",
        },
      };
      grid[col][2] = "SKIP"; // occupied by product's row-span
    }
  });

  // Fill remaining cells with textured filler patches
  for (let c = 0; c < totalCols; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (grid[c][r] === null) {
        grid[c][r] = makeFillerPatch();
      }
    }
  }

  // Flatten grid to array (skip "SKIP" placeholders)
  for (let c = 0; c < totalCols; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (grid[c][r] !== "SKIP") {
        patches.push(grid[c][r]);
      }
    }
  }

  return patches;
}

function makeFillerPatch() {
  return {
    kind: "solid",
    color: pick(FABRIC_PALETTE),
    fabric: pick(FABRIC_TEXTURES),
    span: 1,
    height: 1,
  };
}

/* =========================
   DOM
========================= */
const track = document.getElementById("rugTrack");
track.classList.add("is-loading");

/* =========================
   RENDER
========================= */
function renderRug(patches) {
  track.innerHTML = "";

  patches.forEach((patch) => {
    const el = document.createElement("div");

    /* Base class */
    el.classList.add("patch");
    el.classList.add(`kind-${patch.kind}`);

    /* Grid span */
    el.style.gridColumn = `span ${patch.span || 1}`;
    el.style.gridRow = `span ${patch.height || 1}`;

    /* ========================= KIND: SOLID ========================= */
    if (patch.kind === "solid") {
      el.style.setProperty("--patch-color", patch.color || "#e8e4d9");

      // Apply fabric texture class
      if (patch.fabric) {
        el.classList.add(`fabric-${patch.fabric}`);
      }
    }

    /* ========================= KIND: PATTERN ========================= */
    if (patch.kind === "pattern") {
      el.classList.add(`pattern-${patch.patternType || "default"}`);
    }

    /* ========================= KIND: PRODUCT ========================= */
    if (patch.kind === "product") {
      el.style.gridRowStart = "2"; // center in 4-row grid
      el.dataset.id = patch.id || "";

      if (patch.productData?.image) {
        const img = document.createElement("img");
        img.src = patch.productData.image;
        img.alt = patch.productData.title || "";
        img.draggable = false;
        img.loading = "lazy";
        el.appendChild(img);

        // Info overlay
        const info = document.createElement("div");
        info.classList.add("patch__info");

        const title = document.createElement("div");
        title.classList.add("patch__info-title");
        title.textContent = patch.productData.title;
        info.appendChild(title);

        if (patch.productData.price) {
          const price = document.createElement("div");
          price.classList.add("patch__info-price");
          price.textContent = formatPrice(patch.productData.price);
          info.appendChild(price);
        }

        if (patch.productData.soldOut) {
          const badge = document.createElement("span");
          badge.classList.add("patch__sold-out");
          badge.textContent = "Sold Out";
          info.appendChild(badge);
        }

        el.appendChild(info);
      } else {
        // Loading state while image isn't available
        el.classList.add("is-loading");
      }

      el.dataset.link = `/product.html?slug=${patch.productData?.slug?.current || ""}`;
    }

    track.appendChild(el);
  });

  // Reveal rug
  track.classList.remove("is-loading");
  track.classList.add("is-ready");
}

/* =========================
   FETCH & INIT
========================= */

// Start with an empty decorative rug immediately
renderRug(buildRugPatches([]));

// Then fetch products from Sanity and re-render
client
  .fetch(ALL_PRODUCTS_QUERY)
  .then((products) => {
    console.log(`📦 Fetched ${products.length} product(s) from Sanity`);
    if (products.length > 0) {
      renderRug(buildRugPatches(products));
    }
  })
  .catch((err) => {
    console.warn("⚠️ Sanity fetch failed, showing decorative rug only:", err);
  });

/* =========================
   PHYSICS — Smooth Drag & Scroll
========================= */
let currentX = 0;
let targetX = 0;
let isDragging = false;
let startX = 0;
let lastX = 0;

let dragStartX = 0;
let isClick = true;

const friction = 0.08;

const getMaxScroll = () => Math.max(0, track.scrollWidth - window.innerWidth);

const handleWheel = (e) => {
  targetX += e.deltaY + e.deltaX;
  targetX = Math.max(0, Math.min(targetX, getMaxScroll()));
};

const handleDown = (e) => {
  isDragging = true;
  isClick = true;

  const pageX = e.pageX ?? e.touches?.[0]?.pageX ?? 0;
  startX = pageX;
  dragStartX = pageX;
  lastX = targetX;

  track.parentElement.style.cursor = "grabbing";
};

const handleMove = (e) => {
  if (!isDragging) return;

  const pageX = e.pageX ?? e.touches?.[0]?.pageX ?? 0;

  if (Math.abs(pageX - dragStartX) > 5) {
    isClick = false;
  }

  const walk = (pageX - startX) * 1.5;
  targetX = lastX - walk;
  targetX = Math.max(0, Math.min(targetX, getMaxScroll()));
};

const handleUp = (e) => {
  isDragging = false;
  track.parentElement.style.cursor = "grab";

  if (isClick) {
    const productEl = (e.target || e.changedTouches?.[0]?.target)?.closest(".kind-product");
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

// Animation loop
function animate() {
  currentX += (targetX - currentX) * friction;
  track.style.transform = `translateX(${-currentX.toFixed(2)}px)`;
  requestAnimationFrame(animate);
}

animate();
