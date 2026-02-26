/* =========================
   rugPatches.js — Modular fabric & layout config
   Single source of truth for:
   1. Session palette (2 colors + 1 stitch color)
   2. Pattern variety (solid, checkered-with-white, etc.)
   3. Grid layout builder (merges Sanity products into patchwork)
========================= */

/* =========================
   COLOR PALETTE POOL
   Each session picks exactly 2 base colors from this pool.
========================= */

const COLOR_POOL = [
  "#1a2a3a", "#2b3d54", "#3b4d61", "#4e6480", "#1e3045",
  "#9b2335", "#c4473a", "#d4826a", "#b85c4a", "#8b4513",
  "#6b4226", "#8b6914", "#c9a84c", "#5a4032", "#7a3b2e",
  "#3c3c3c", "#1a1a1a", "#6b6b6b", "#b5aa96", "#8c7e6a",
  "#5e5040", "#7a6e5d", "#4a5a3a", "#6e6050",
  "#2c2c2c", "#4a4a4a", "#3a4a5a",
  "#d6cfc3", "#c4b8a0", "#556b2f", "#8b7d6b",
  "#2a0a2a", "#1a3a2a", "#5a1a2a", "#0a1a3a",
  "#c4b8a8", "#e8dcc8", "#b8a890",
  "#c75030", "#2b5a4a", "#d4a03c",
  "#f0e8d8", "#e0d5c0", "#c8bda8",
];

/** Stitch color candidates (one per session) */
const STITCH_COLORS = [
  "#ffffff", "#e8e0d0", "#1a1a1a", "#c4473a", "#d4a03c",
  "#556b2f", "#8b6914", "#3a4a5a", "#b85c4a", "#6b6b6b",
];

/** Fabric texture names (CSS classes) */
const FABRICS = [
  "denim", "flannel", "corduroy", "wool", "tweed",
  "herringbone", "canvas", "velvet", "satin", "knit", "linen",
];

/* =========================
   GRID CONFIG
========================= */

export const GRID_ROWS = 4;
export const FILLER_COLS_AROUND_PRODUCT = 2;

// Rug sizing rule:
// - Always at least 2 pages wide
// - +0.5 page per product beyond 4
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

function pickTwo(arr) {
  const a = pick(arr);
  let b = pick(arr);
  let tries = 0;
  while (b === a && tries < 20) { b = pick(arr); tries++; }
  return [a, b];
}

/* =========================
   SESSION PALETTE — chosen once, reused for every patch
========================= */

const [SESSION_COLOR_A, SESSION_COLOR_B] = pickTwo(COLOR_POOL);
const SESSION_STITCH_COLOR = pick(STITCH_COLORS);
const SESSION_FABRICS = [pick(FABRICS), pick(FABRICS)];

/** Export so shop.js can set the CSS stitch color variable */
export { SESSION_STITCH_COLOR };

/* =========================
   PATCH PATTERN TYPES
   Each filler randomly gets one of these visual treatments.
   "checkered" alternates the session color with white.
========================= */

const PATTERN_TYPES = ["solid", "solid", "solid", "checkered"];

/* =========================
   FILLER PATCH FACTORY
========================= */

export function makeFillerPatch() {
  const isColorA = seededRandom() > 0.5;
  const color = isColorA ? SESSION_COLOR_A : SESSION_COLOR_B;
  const fabric = isColorA ? SESSION_FABRICS[0] : SESSION_FABRICS[1];
  const patternType = pick(PATTERN_TYPES);

  return {
    kind: patternType === "checkered" ? "checkered" : "solid",
    color,
    fabric,
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

  /* ---- Place products at RANDOM columns (not middle), avoiding both ends ---- */
  const margin = FILLER_COLS_AROUND_PRODUCT;
  const minCol = margin;
  const maxCol = Math.max(minCol + 1, totalCols - 1 - margin);
  const usedCols = new Set();

  safeProducts.forEach((product) => {
    let col;
    let tries = 0;
    do {
      col = minCol + Math.floor(seededRandom() * (maxCol - minCol + 1));
      tries++;
    } while (usedCols.has(col) && tries < 100);

    // Fallback: find nearest free column
    while (usedCols.has(col) && col <= maxCol) col++;
    while (usedCols.has(col) && col >= minCol) col--;

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
