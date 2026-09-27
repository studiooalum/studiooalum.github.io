import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { getWorkshopBookingConfig, getWorkshopScheduleSlots, getWorkshopTypeLabel } from "../runtime/storefront/scripts/utils/workshops.js";

test("workshop prices use administrator pricing for the entire party without invented defaults", () => {
  const config = getWorkshopBookingConfig({ price: 50000, bookingConfig: { type: "daily", maxParticipants: 8 } });
  assert.equal(config.attendeePrices[1], 50000);
  assert.equal(config.attendeePrices[8], 400000);
  assert.equal(getWorkshopBookingConfig({ bookingConfig: { type: "daily" } }).attendeePrices[1], 0);
  assert.equal(getWorkshopBookingConfig({ price: 50000, bookingConfig: { type: "daily", priceTiers: { 2: 90000 } } }).attendeePrices[2], 90000);
});

test("workshop type labels match the administrator workshop type", () => {
  assert.equal(getWorkshopTypeLabel({ bookingConfig: { workshopType: "daily" } }), "원데이클래스");
  assert.equal(getWorkshopTypeLabel({ bookingConfig: { workshopType: "event" } }), "워크숍");
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
const workshopsHtml = await readFile(new URL("../workshops.html", import.meta.url), "utf8");
const workshopsCss = await readFile(
  new URL("../runtime/storefront/styles/workshops-page-20260816-05.css", import.meta.url),
  "utf8",
);
const workshopsJs = await readFile(
  new URL("../runtime/storefront/scripts/workshops-20260816-03.js", import.meta.url),
  "utf8",
);
const workshopCss = await readFile(
  new URL("../runtime/storefront/styles/workshop-20260918-01.css", import.meta.url),
  "utf8",
);
const workshopDetailCss = await readFile(
  new URL("../runtime/storefront/styles/workshop-20260925-01.css", import.meta.url),
  "utf8",
);
const storefrontActionsCss = await readFile(
  new URL("../runtime/storefront/styles/storefront-actions-20260925-02.css", import.meta.url),
  "utf8",
);
const cartCss = await readFile(
  new URL("../runtime/storefront/styles/cart-20260818-02.css", import.meta.url),
  "utf8",
);
const workshopJs = await readFile(
  new URL("../runtime/storefront/scripts/workshop-20260816-01.js", import.meta.url),
  "utf8",
);
const workshopAdminHtml = await readFile(new URL("../workshop-admin.html", import.meta.url), "utf8");
const typography = await readFile(new URL("../runtime/storefront/styles/typography-20260924.css", import.meta.url), "utf8");
const workshopSchema = await readFile(new URL("../cloudflare/d1/schema.sql", import.meta.url), "utf8");
const workshopTypeMigration = await readFile(new URL("../cloudflare/d1/migrations/0040_workshop_type_unification.sql", import.meta.url), "utf8");
const workshopContentJs = await readFile(new URL("../cloudflare/lib/workshop-content.js", import.meta.url), "utf8");

test("workshop listing follows the newsletter card ratio without image hover", () => {
  assert.match(workshopsHtml, /workshops-page-20260816-05\.css\?v=20260927-08/);
  assert.match(workshopsHtml, /workshops-20260924\.js\?v=20260927-07/);
  assert.match(workshopsCss, /\.workshops-card__poster\s*\{[^}]*aspect-ratio:\s*1\.6 \/ 1;/);
  assert.match(workshopsCss, /\.workshops-card__title\s*\{[^}]*font-size:\s*20px;[^}]*line-height:\s*1\.2;/);
  assert.match(workshopsCss, /\.workshops-card__title-row\s*\{[^}]*align-items:\s*flex-start;[^}]*justify-content:\s*space-between;/);
  assert.match(workshopsCss, /\.workshops-card__type\s*\{[^}]*text-decoration:\s*underline;/);
  assert.match(workshopsCss, /\.workshops-card:is\(:hover, :focus-visible, \.is-pointer-hover\) \.workshops-card__poster img\s*\{[^}]*transform:\s*none;/);
  assert.match(workshopsJs, /titleRow\.append\(title, type\)/);
  assert.match(workshopsJs, /body\.append\(titleRow, meta\)/);
  assert.match(workshopsJs, /String\(workshop\?\.summary \|\| workshop\?\.description \|\| ""\)\.trim\(\)/);
  assert.doesNotMatch(workshopsJs, /getWorkshopLocation|locationName/);
  assert.match(workshopsHtml, /id="workshopsGrid"/);
  assert.doesNotMatch(workshopsHtml, /개의 워크숍|개의 원데이 클래스|개의 맞춤 워크숍|workshops-carousel|data-carousel/);
  assert.doesNotMatch(workshopsCss, /workshops-carousel|grid-auto-flow|scroll-snap-type/);
  assert.match(workshopsCss, /@media \(min-width:\s*800px\)[\s\S]*?\.workshops-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(workshopsJs, /\{ value:\s*"daily", label:\s*"원데이클래스" \}/);
  assert.match(workshopsJs, /\{ value:\s*"event", label:\s*"워크숍" \}/);
  assert.match(workshopsJs, /\{ value:\s*"custom", label:\s*"맞춤 워크숍" \}/);
  assert.match(workshopsJs, /tag\.value === "custom" \? "button" : "a"/);
  assert.match(workshopsJs, /getWorkshopTypeLabel\(workshop\)/);
  assert.doesNotMatch(workshopsJs, /normalizeWorkshopCategory|WORKSHOP_CATEGORIES|standardItems|oneDayItems|customGridEl/);
  assert.match(workshopsCss, /@media \(min-width:\s*800px\)[\s\S]*?\.workshops-page \.workshops-card__title\s*\{[^}]*font-size:\s*20px;[^}]*line-height:\s*1\.2;/);
});
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
  assert.match(workshopHtml, /workshop-20260925-01\.css\?v=20260927-02/);
  assert.match(workshopHtml, /workshop-20260924\.js\?v=20260927-02/);
  assert.match(workshopHtml, /class="workshop-kicker" id="workshopKicker"[^>]*hidden/);
  assert.match(workshopJs, /dom\.kicker\.textContent = getWorkshopTypeLabel\(workshop\)/);
  assert.match(workshopJs, /dom\.kicker\.href = `\.\/workshops\.html\?type=\$\{encodeURIComponent\(workshopType\)\}`/);
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
  assert.match(workshopJs, /lastImageRect\.top - mediaRect\.top/);
  assert.doesNotMatch(workshopJs, /lastImage\.offsetTop \+ stickyHeight/);
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

test("workshop information uses the workshop type kicker and one archive-like hierarchy", () => {
  for (const label of ["소개", "제공하는 재료", "장소", "커리큘럼", "안내"]) {
    assert.match(workshopHtml, new RegExp(`>${label}<\\/h2>`));
  }
  assert.doesNotMatch(workshopHtml, />준비물<\/h2>|id="workshopBring"/);
  assert.doesNotMatch(workshopHtml, />금액<\/span>/);
  assert.match(workshopHtml, /id="workshopPrice"/);
  assert.match(workshopHtml, /id="workshopKicker"/);
  assert.match(workshopCss, /\.workshop-schedule-overview\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(workshopJs, /제공되는 재료가 없습니다\./);
  assert.match(workshopJs, /dom\.bringSection\.hidden = thingsToBring\.length === 0/);
  assert.doesNotMatch(workshopJs, /별도로 준비할 재료가 없습니다\./);
  assert.match(workshopCss, /\.workshop-fact__list li::before\s*\{\s*content:\s*none/);
  assert.match(workshopDetailCss, /font-size:\s*16px;[\s\S]*?line-height:\s*1\.45;[\s\S]*?text-decoration:\s*none;[\s\S]*?color:\s*#111/);
  assert.match(workshopJs, /function formatWon\(amount\)/);
  assert.match(workshopJs, /\? formatWon\(config\.attendeePrices\[1\]\)/);
  assert.match(workshopDetailCss, /#workshopDescription p\s*\{[^}]*line-height:\s*1\.45/);
  assert.match(workshopDetailCss, /\.workshop-information\s*\{[^}]*gap:\s*0/);
  assert.match(workshopDetailCss, /\.workshop-summary-card__details > div\s*\{[^}]*grid-template-columns:\s*76px minmax\(0, 1fr\);[^}]*gap:\s*0/);
  assert.match(workshopDetailCss, /\.workshop-summary-card__details dd\s*\{[^}]*justify-self:\s*start;[^}]*text-align:\s*left/);
  assert.match(workshopDetailCss, /@media \(min-width:\s*960px\)\s*\{[^}]*\.workshop-stage__sidebar-track\s*\{[^}]*position:\s*relative;[^}]*align-self:\s*stretch/);
  assert.match(workshopDetailCss, /\.workshop-stage__sidebar\s*\{[^}]*position:\s*sticky;[^}]*top:\s*calc\(var\(--gnb-height, 40px\) \+ var\(--page-top-space\)\);[^}]*align-self:\s*start/);
});

test("storefront action boxes use half width while the cart keeps full width and repair height", () => {
  assert.match(storefrontActionsCss, /\.account-panel--login/);
  assert.match(storefrontActionsCss, /\.workshop-summary-card__action \.workshop-apply-btn/);
  assert.match(storefrontActionsCss, /\.edition-actions > \.edition-btn/);
  assert.match(storefrontActionsCss, /\.checkout-submit-btn/);
  assert.match(storefrontActionsCss, /width:\s*50% !important/);
  assert.match(cartCss, /\.cart-panel__checkout-btn\s*\{[^}]*height:\s*46px !important;[^}]*min-height:\s*46px !important;[^}]*font-weight:\s*400 !important/);
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
  assert.match(workshopAdminHtml, /<span>워크숍 유형<\/span>/);
  assert.match(workshopAdminHtml, /<option value="daily">원데이클래스<\/option>/);
  assert.match(workshopAdminHtml, /<option value="event">워크숍<\/option>/);
  assert.doesNotMatch(workshopAdminHtml, /name="category"|name="categoryPreset"|>분류</);
  assert.doesNotMatch(workshopSchema.match(/CREATE TABLE IF NOT EXISTS workshops \([\s\S]*?\);/)?.[0] || "", /\bcategory\b/);
  assert.match(workshopContentJs, /category:\s*_legacyCategory[\s\S]*?workshopCategory:\s*_legacyWorkshopCategory/);
  assert.match(workshopTypeMigration, /json_set\([\s\S]*?'\$\.workshopType'/);
  assert.match(workshopTypeMigration, /ALTER TABLE workshops DROP COLUMN category/);
});

test("workshop type migration preserves daily workshops, defaults others, and removes category", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE workshops (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL DEFAULT '',
      booking_config_json TEXT NOT NULL DEFAULT '{}'
    );
    INSERT INTO workshops (id, category, booking_config_json) VALUES
      ('daily', 'legacy', '{"mode":"daily"}'),
      ('event', 'legacy', '{"workshopType":"event"}'),
      ('invalid', 'legacy', 'not-json');
  `);

  db.exec(workshopTypeMigration);

  const columns = db.prepare("PRAGMA table_info(workshops)").all().map((column) => column.name);
  assert.equal(columns.includes("category"), false);
  const rows = db.prepare("SELECT id, booking_config_json FROM workshops ORDER BY id").all();
  const types = Object.fromEntries(rows.map((row) => [row.id, JSON.parse(row.booking_config_json).workshopType]));
  assert.deepEqual(types, { daily: "daily", event: "event", invalid: "event" });
  db.close();
});
