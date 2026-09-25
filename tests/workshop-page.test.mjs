import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getWorkshopBookingConfig, getWorkshopScheduleSlots } from "../runtime/storefront/scripts/utils/workshops.js";

test("workshop prices use administrator pricing for the entire party without invented defaults", () => {
  const config = getWorkshopBookingConfig({ price: 50000, bookingConfig: { type: "daily", maxParticipants: 8 } });
  assert.equal(config.attendeePrices[1], 50000);
  assert.equal(config.attendeePrices[8], 400000);
  assert.equal(getWorkshopBookingConfig({ bookingConfig: { type: "daily" } }).attendeePrices[1], 0);
  assert.equal(getWorkshopBookingConfig({ price: 50000, bookingConfig: { type: "daily", priceTiers: { 2: 90000 } } }).attendeePrices[2], 90000);
});

test("one-day calendar exposes valid administrator time slots and stable keys", () => {
  const workshop = { slug: "class", price: 50000, bookingConfig: { type: "daily", maxBookingMonths: 1, dailyTimeSlots: [
    { startTime: "14:00", endTime: "17:00" },
    { startTime: "10:00", endTime: "13:00" },
    { startTime: "29:00", endTime: "30:00" },
    { startTime: "10:00", endTime: "13:00" },
  ] } };
  const slots = getWorkshopScheduleSlots(workshop);
  assert.ok(slots.length >= 2);
  assert.equal(slots[0].startTime, "10:00");
  assert.equal(slots[1].startTime, "14:00");
  assert.equal(slots[0].date, slots[1].date);
  assert.equal(new Set(slots.map((slot) => slot.key)).size, slots.length);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  assert.ok(slots.every((slot) => slot.date > today));
});

const workshopHtml = await readFile(new URL("../workshop.html", import.meta.url), "utf8");
const workshopCss = await readFile(
  new URL("../runtime/storefront/styles/workshop-20260918-01.css", import.meta.url),
  "utf8",
);
const workshopDetailCss = await readFile(
  new URL("../runtime/storefront/styles/workshop-20260925-01.css", import.meta.url),
  "utf8",
);
const formControlsCss = await readFile(
  new URL("../runtime/storefront/styles/form-controls-20260925-01.css", import.meta.url),
  "utf8",
);
const workshopJs = await readFile(
  new URL("../runtime/storefront/scripts/workshop-20260816-01.js", import.meta.url),
  "utf8",
);
const workshopAdminHtml = await readFile(new URL("../workshop-admin.html", import.meta.url), "utf8");
const typography = await readFile(new URL("../runtime/storefront/styles/typography-20260924.css", import.meta.url), "utf8");
test("storefront detail typography matches newsletter reading size without viewport font scaling", () => {
  assert.match(typography, /--type-body:\s*16px/);
  assert.match(typography, /--type-body-leading:\s*1\.55/);
  assert.match(typography, /\.edition-page \.edition-desc/);
  assert.match(typography, /\.product-page \.product-intro/);
  assert.match(typography, /letter-spacing:\s*0/);
  assert.doesNotMatch(typography, /font-size:.*vw/);
});

test("workshop detail keeps the information-first page structure", () => {
  assert.match(workshopHtml, /workshop-20260918-01\.css/);
  assert.match(workshopHtml, /workshop-20260925-01\.css/);
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
  assert.doesNotMatch(workshopHtml, /workshopBookingCancel|취소하기/);
  assert.doesNotMatch(workshopJs, /workshopBookingCancel|dom\.cancel/);
});

test("workshop imagery preserves the poster ratio and opens in the edition lightbox", () => {
  assert.match(workshopCss, /\.workshop-poster img\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*auto/);
  assert.match(workshopCss, /\.edition-lightbox__image\s*\{[\s\S]*?object-fit:\s*contain/);
  assert.match(workshopJs, /function bindWorkshopImageLightbox\(\)/);
  assert.match(workshopJs, /lockBodyScroll\("workshop-lightbox"\)/);
  assert.match(workshopJs, /unlockBodyScroll\("workshop-lightbox"\)/);
});

test("workshop details mirror the edition columns and the application panel stays in column three", () => {
  assert.doesNotMatch(workshopHtml, /날짜와 시간을 선택한 뒤 예약 정보를 입력해 주세요/);
  assert.match(workshopCss, /\.workshop-summary-card\s*\{[\s\S]*?border:\s*0/);
  assert.match(workshopCss, /\.workshop-summary-card__action\s*\{[\s\S]*?padding:\s*0/);
  assert.match(workshopCss, /\.workshop-apply-btn\s*\{[\s\S]*?width:\s*100%/);
  assert.match(workshopCss, /\.workshop-rail__panel\s*\{[\s\S]*?left:\s*var\(--page-third-start\);[\s\S]*?right:\s*0;[\s\S]*?width:\s*auto/);
  assert.match(workshopCss, /\.workshop-calendar__day,[\s\S]*?\.workshop-calendar__blank\s*\{[\s\S]*?aspect-ratio:\s*1 \/ 1/);
  assert.match(workshopCss, /\.workshop-stage__summary\s*\{[\s\S]*?gap:\s*24px/);
  assert.match(workshopCss, /\.workshop-facts\s*\{[\s\S]*?gap:\s*24px/);
});

test("workshop information removes the category kicker and uses one archive-like hierarchy", () => {
  for (const label of ["소개", "제공하는 재료", "장소", "준비물", "커리큘럼", "안내"]) {
    assert.match(workshopHtml, new RegExp(`>${label}<\\/h2>`));
  }
  assert.match(workshopHtml, />금액<\/span>[\s\S]*?id="workshopPrice"/);
  assert.doesNotMatch(workshopHtml, /id="workshopKicker"/);
  assert.match(workshopCss, /\.workshop-schedule-overview\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(workshopJs, /제공되는 재료가 없습니다\./);
  assert.match(workshopJs, /dom\.bringSection\.hidden = thingsToBring\.length === 0/);
  assert.doesNotMatch(workshopJs, /별도로 준비할 재료가 없습니다\./);
  assert.match(workshopCss, /\.workshop-fact__list li::before\s*\{\s*content:\s*none/);
  assert.match(workshopDetailCss, /font-size:\s*16px;[\s\S]*?line-height:\s*1\.45;[\s\S]*?text-decoration:\s*none;[\s\S]*?color:\s*#111/);
  assert.match(workshopJs, /function formatWon\(amount\)/);
  assert.match(workshopJs, /\? formatWon\(config\.attendeePrices\[1\]\)/);
});

test("customer-facing checkboxes use the compact shared control and body copy", () => {
  assert.match(formControlsCss, /font-size:\s*13px/);
  assert.match(formControlsCss, /line-height:\s*1\.55/);
  assert.match(formControlsCss, /width:\s*8px/);
  assert.match(formControlsCss, /height:\s*8px/);
  assert.match(formControlsCss, /\.account-checkbox/);
  assert.match(formControlsCss, /\.workshop-inquiry-consent/);
  assert.match(formControlsCss, /\.checkout-agree__item/);
});

test("workshop admin keeps material fields with detail content and limits advanced settings", () => {
  assert.equal((workshopAdminHtml.match(/name="slug"/g) || []).length, 1);
  const detailSection = workshopAdminHtml.match(/<summary>상세 설명과 이미지<\/summary>[\s\S]*?<\/details>/)?.[0] || "";
  const advancedSection = workshopAdminHtml.match(/<summary>고급 설정<\/summary>[\s\S]*?<\/details>/)?.[0] || "";
  assert.match(detailSection, /name="materials"/);
  assert.match(detailSection, /name="thingsToBring"/);
  assert.match(advancedSection, /name="slug"/);
  assert.match(advancedSection, /name="sortOrder"/);
  assert.doesNotMatch(advancedSection, /name="materials"|name="thingsToBring"|name="locationDetail"/);
});
