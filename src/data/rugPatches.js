/* =========================
   rugPatches.js — Modular fabric & layout config
   Single source of truth for:
   1. Fabric texture definitions (color + CSS class combos)
   2. Grid layout builder (merges Sanity products into patchwork)
========================= */

/* =========================
   FABRIC SWATCHES
   Each swatch = { color, fabric }
   Grouped by garment type — real scrap material colors
========================= */

const DENIM = [
  { color: "#1a2a3a", fabric: "denim" },
  { color: "#2b3d54", fabric: "denim" },
  { color: "#3b4d61", fabric: "denim" },
  { color: "#4e6480", fabric: "denim" },
  { color: "#6a88a8", fabric: "denim" },
  { color: "#1e3045", fabric: "denim" },
];

const FLANNEL = [
  { color: "#9b2335", fabric: "flannel" },
  { color: "#c4473a", fabric: "flannel" },
  { color: "#d4826a", fabric: "flannel" },
  { color: "#b85c4a", fabric: "flannel" },
  { color: "#2d5a3d", fabric: "flannel" },
  { color: "#8b4513", fabric: "flannel" },
];

const CORDUROY = [
  { color: "#6b4226", fabric: "corduroy" },
  { color: "#8b6914", fabric: "corduroy" },
  { color: "#c9a84c", fabric: "corduroy" },
  { color: "#5a4032", fabric: "corduroy" },
  { color: "#2d5a3d", fabric: "corduroy" },
  { color: "#7a3b2e", fabric: "corduroy" },
];

const WOOL = [
  { color: "#3c3c3c", fabric: "wool" },
  { color: "#1a1a1a", fabric: "wool" },
  { color: "#6b6b6b", fabric: "wool" },
  { color: "#e8e0d0", fabric: "wool" },
  { color: "#b5aa96", fabric: "wool" },
  { color: "#8c7e6a", fabric: "wool" },
];

const TWEED = [
  { color: "#5e5040", fabric: "tweed" },
  { color: "#7a6e5d", fabric: "tweed" },
  { color: "#4a5a3a", fabric: "tweed" },
  { color: "#6e6050", fabric: "tweed" },
  { color: "#8a7a68", fabric: "tweed" },
];

const HERRINGBONE = [
  { color: "#2c2c2c", fabric: "herringbone" },
  { color: "#4a4a4a", fabric: "herringbone" },
  { color: "#6e6050", fabric: "herringbone" },
  { color: "#3a4a5a", fabric: "herringbone" },
];

const CANVAS = [
  { color: "#d6cfc3", fabric: "canvas" },
  { color: "#c4b8a0", fabric: "canvas" },
  { color: "#556b2f", fabric: "canvas" },
  { color: "#8b7d6b", fabric: "canvas" },
  { color: "#2f2f2f", fabric: "canvas" },
];

const VELVET = [
  { color: "#2a0a2a", fabric: "velvet" },
  { color: "#1a3a2a", fabric: "velvet" },
  { color: "#5a1a2a", fabric: "velvet" },
  { color: "#0a1a3a", fabric: "velvet" },
  { color: "#3a2a1a", fabric: "velvet" },
];

const SATIN = [
  { color: "#c4b8a8", fabric: "satin" },
  { color: "#e8dcc8", fabric: "satin" },
  { color: "#b8a890", fabric: "satin" },
  { color: "#2a2a2a", fabric: "satin" },
];

const KNIT = [
  { color: "#e8d8c8", fabric: "knit" },
  { color: "#c75030", fabric: "knit" },
  { color: "#2b5a4a", fabric: "knit" },
  { color: "#d4a03c", fabric: "knit" },
  { color: "#1a1a1a", fabric: "knit" },
];

const LINEN = [
  { color: "#f0e8d8", fabric: "linen" },
  { color: "#e0d5c0", fabric: "linen" },
  { color: "#c8bda8", fabric: "linen" },
  { color: "#b0a590", fabric: "linen" },
  { color: "#d8ceb8", fabric: "linen" },
];

/** Every swatch in one flat pool */
export const ALL_SWATCHES = [
  ...DENIM, ...FLANNEL, ...CORDUROY, ...WOOL, ...TWEED,
  ...HERRINGBONE, ...CANVAS, ...VELVET, ...SATIN, ...KNIT, ...LINEN,
];

/* =========================
   GRID CONFIG
========================= */

export const GRID_ROWS = 4;
export const FILLER_COLS_AROUND_PRODUCT = 2;

// Rug sizing rule (in "pages" of viewport width):
// - Always at least 2 pages wide
// - Add 0.5 page for each product beyond 4
const MIN_PAGES_WIDE = 2;
const PRODUCTS_BEFORE_EXTRA_WIDTH = 4;
const EXTRA_PAGES_PER_PRODUCT = 0.5;

// Keep in sync with CSS: .rug-track { grid-auto-columns: 25vh; }
const PATCH_COL_VH = 25;

/* =========================
   SEEDED RANDOM (consistent per session)
========================= */

let _seed = Date.now();

function seededRandom() {
  _seed = (_seed * 16807 + 0) % 2147483647;
  return (_seed - 1) / 2147483646;
}

export function pick(arr) {
  return arr[Math.floor(seededRandom() * arr.length)];
}

/* =========================
   FILLER PATCH FACTORY
========================= */

export function makeFillerPatch() {
  const swatch = pick(ALL_SWATCHES);
  return {
    kind: "solid",
    color: swatch.color,
    fabric: swatch.fabric,
    span: 1,
    height: 1,
  };
}

/* =========================
   BUILD RUG GRID
   Takes array of Sanity product objects →
   Returns flat array of patch objects for renderer
========================= */

export function buildRugPatches(products) {
  const patches = [];
  const ROWS = GRID_ROWS;

  const safeProducts = Array.isArray(products) ? products : [];
  const productCount = safeProducts.length;

  const desiredPages = MIN_PAGES_WIDE +
    Math.max(0, productCount - PRODUCTS_BEFORE_EXTRA_WIDTH) * EXTRA_PAGES_PER_PRODUCT;

  const fallbackColWidthPx = 160;
  const colWidthPx = window?.innerHeight
    ? (window.innerHeight * (PATCH_COL_VH / 100))
    : fallbackColWidthPx;
  const minColsForPages = Math.max(
    8,
    Math.ceil((desiredPages * (window?.innerWidth || 0)) / (colWidthPx || fallbackColWidthPx))
  );

  if (productCount === 0) {
    const cols = minColsForPages;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < ROWS; r++) {
        patches.push(makeFillerPatch());
      }
    }
    return patches;
  }

  const baseCols = productCount * (1 + FILLER_COLS_AROUND_PRODUCT) + FILLER_COLS_AROUND_PRODUCT;
  const totalCols = Math.max(baseCols, minColsForPages);
  const grid = Array.from({ length: totalCols }, () => Array(ROWS).fill(null));

  const minCol = FILLER_COLS_AROUND_PRODUCT;
  const maxCol = Math.max(minCol, totalCols - 1 - FILLER_COLS_AROUND_PRODUCT);
  const usedCols = new Set();

  safeProducts.forEach((product, i) => {
    let col;
    if (productCount === 1) {
      col = Math.round((minCol + maxCol) / 2);
    } else {
      const t = i / (productCount - 1);
      col = Math.round(minCol + t * (maxCol - minCol));
    }

    while (usedCols.has(col) && col < maxCol) col += 1;
    while (usedCols.has(col) && col > minCol) col -= 1;
    usedCols.add(col);

    grid[col][1] = { ...product, _gridProduct: true };
    grid[col][2] = "SKIP";
  });

  for (let c = 0; c < totalCols; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (grid[c][r] === null) {
        grid[c][r] = makeFillerPatch();
      }
    }
  }

  for (let c = 0; c < totalCols; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (grid[c][r] !== "SKIP") {
        patches.push(grid[c][r]);
      }
    }
  }

  return patches;
}
