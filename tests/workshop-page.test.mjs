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
const workshopAdminHtml = await readFile(new URL("../workshop-admin.html", import.meta.url), "utf8");

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
  assert.match(workshopCss, /\.workshop-stage__media\s*\{[\s\S]*?gap:\s*0/);
  assert.match(workshopCss, /\.workshop-gallery__grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[\s\S]*?gap:\s*0/);
  assert.match(workshopCss, /\.workshop-gallery__item\s*\{[\s\S]*?aspect-ratio:\s*1 \/ 1/);
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

test("workshop imagery preserves the poster ratio and opens in the edition lightbox", () => {
  assert.match(workshopCss, /\.workshop-poster img\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*auto/);
  assert.match(workshopCss, /\.edition-lightbox__image\s*\{[\s\S]*?object-fit:\s*contain/);
  assert.match(workshopJs, /function bindWorkshopImageLightbox\(\)/);
  assert.match(workshopJs, /lockBodyScroll\("workshop-lightbox"\)/);
  assert.match(workshopJs, /unlockBodyScroll\("workshop-lightbox"\)/);
});

test("workshop summary and application panel use the full available grid width", () => {
  assert.doesNotMatch(workshopHtml, /날짜와 시간을 선택한 뒤 예약 정보를 입력해 주세요/);
  assert.match(workshopCss, /\.workshop-summary-card__action\s*\{[\s\S]*?padding:\s*0 24px 24px/);
  assert.match(workshopCss, /\.workshop-apply-btn\s*\{[\s\S]*?width:\s*100%/);
  assert.match(workshopCss, /\.workshop-rail__panel\s*\{[\s\S]*?left:\s*var\(--page-gutter\);[\s\S]*?right:\s*var\(--page-gutter\)/);
});

test("workshop information uses category-only labeling and clear empty material copy", () => {
  assert.match(workshopHtml, />curriculum<\/h2>/);
  assert.doesNotMatch(workshopJs, /workshop \/ \$\{workshop\.category/);
  assert.match(workshopJs, /dom\.kicker\.textContent = category/);
  assert.match(workshopJs, /제공되는 재료가 없습니다\./);
  assert.match(workshopJs, /별도로 준비할 재료가 없습니다\./);
  assert.match(workshopCss, /\.workshop-fact__list li::before\s*\{\s*content:\s*none/);
});

test("workshop admin keeps material fields with detail content and limits advanced settings", () => {
  const detailSection = workshopAdminHtml.match(/<summary>상세 설명과 이미지<\/summary>[\s\S]*?<\/details>/)?.[0] || "";
  const advancedSection = workshopAdminHtml.match(/<summary>고급 설정<\/summary>[\s\S]*?<\/details>/)?.[0] || "";
  assert.match(detailSection, /name="materials"/);
  assert.match(detailSection, /name="thingsToBring"/);
  assert.match(advancedSection, /name="slug"/);
  assert.match(advancedSection, /name="sortOrder"/);
  assert.doesNotMatch(advancedSection, /name="materials"|name="thingsToBring"|name="locationDetail"/);
});
