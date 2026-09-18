import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workshopHtml = await readFile(new URL("../workshop.html", import.meta.url), "utf8");
const workshopCss = await readFile(
  new URL("../runtime/storefront/styles/workshop-20260918-01.css", import.meta.url),
  "utf8",
);
const workshopJs = await readFile(
  new URL("../runtime/storefront/scripts/workshop-20260816-01.js", import.meta.url),
  "utf8",
);

test("workshop detail keeps the information-first page structure", () => {
  assert.match(workshopHtml, /workshop-20260918-01\.css/);
  assert.match(workshopHtml, /class="workshop-stage__media"/);
  assert.match(workshopHtml, /class="workshop-stage__sidebar-track"/);
  assert.match(workshopHtml, /class="workshop-stage__sidebar"/);
  assert.match(workshopHtml, /id="workshopMedia"/);
  assert.match(workshopHtml, /id="workshopSidebarTrack"/);
  assert.match(workshopHtml, /id="workshopSidebar"/);
  assert.match(workshopHtml, /class="workshop-information workshop-information--about"/);
  assert.match(workshopHtml, /class="workshop-stage__summary"/);
  assert.match(workshopHtml, /class="workshop-summary-card"/);

  for (const id of [
    "workshopTitle",
    "workshopDescription",
    "workshopMaterials",
    "workshopLocation",
    "workshopBring",
    "workshopPrice",
    "workshopDuration",
    "workshopLevel",
    "workshopCapacity",
    "workshopApplyBtn",
    "workshopRail",
  ]) {
    assert.equal((workshopHtml.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, `expected one #${id}`);
  }
});

test("workshop detail follows the site's three-column grid and typography tokens", () => {
  assert.match(workshopCss, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(workshopCss, /\.workshop-stage__media\s*\{[\s\S]*?grid-column:\s*1/);
  assert.match(workshopCss, /\.workshop-stage__sidebar-track\s*\{[\s\S]*?grid-column:\s*2 \/ span 2/);
  assert.match(workshopCss, /\.workshop-stage__sidebar\s*\{[\s\S]*?position:\s*sticky/);
  assert.match(workshopCss, /\.workshop-stage__sidebar\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(workshopCss, /font-family:\s*var\(--font-book\)/);
  assert.match(workshopCss, /font-family:\s*var\(--font-kor-body\)/);
  assert.match(workshopCss, /font-size:\s*clamp\(28px, 2\.6vw, 34px\)/);
  assert.match(workshopJs, /function syncWorkshopStickyStop\(\)/);
  assert.match(workshopJs, /lastImage\.offsetTop \+ stickyHeight/);
  assert.match(workshopJs, /new ResizeObserver\(syncWorkshopStickyStop\)/);
});

test("workshop detail retains responsive reading and booking layouts", () => {
  assert.match(workshopCss, /@media \(max-width:\s*959px\)/);
  assert.match(workshopCss, /@media \(max-width:\s*559px\)/);
  assert.match(workshopCss, /\.workshop-facts\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(workshopHtml, /class="workshop-stage__rail" id="workshopRail"/);
  assert.match(workshopHtml, /id="workshopBookingForm"/);
});
