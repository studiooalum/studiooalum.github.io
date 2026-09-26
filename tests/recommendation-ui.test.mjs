import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const cartPagePaths = [
  "account.html",
  "archive.html",
  "checkout.html",
  "edition.html",
  "forgot-password.html",
  "my-repairs.html",
  "newsletter.html",
  "product.html",
  "repair.html",
  "shop.html",
  "signup.html",
  "workshop.html",
  "workshops.html",
];
const [editionHtml, editionScript, editionCss, archiveScript, archiveCss, newsletterScript, newsletterCss, cartCss, cartScript, cartEntryScript, productHtml, productScript, productCss, actionsCss, siteChromeScript, gnbCss] = await Promise.all([
  read("../edition.html"),
  read("../runtime/storefront/scripts/edition-20260706-06.js"),
  read("../runtime/storefront/styles/edition.css"),
  read("../runtime/storefront/scripts/archive-20260818-02.js"),
  read("../runtime/storefront/styles/archive-20260818-02.css"),
  read("../runtime/storefront/scripts/newsletter-20260818-02.js"),
  read("../runtime/storefront/styles/newsletter-20260818-03.css"),
  read("../runtime/storefront/styles/cart-20260818-02.css"),
  read("../runtime/storefront/scripts/cart-20260706-06.js"),
  read("../runtime/storefront/scripts/cart-20260818-02.js"),
  read("../product.html"),
  read("../runtime/storefront/scripts/product.js"),
  read("../runtime/storefront/styles/product.css"),
  read("../runtime/storefront/styles/actions-20260924.css"),
  read("../runtime/storefront/scripts/components/siteChrome-20260818-05.js"),
  read("../runtime/storefront/styles/gnb-20260818-05.css"),
]);
const cartPages = await Promise.all(cartPagePaths.map((path) => read(`../${path}`)));

test("edition recommendations crop square images from the center", () => {
  assert.match(editionHtml, /edition\.css\?v=20260926-02/);
  assert.match(editionCss, /\.edition-recommend-card__thumb > \.progressive-image\s*\{[\s\S]*?height:\s*100%;/);
  assert.match(editionCss, /\.edition-recommend-card__thumb img\s*\{[\s\S]*?object-fit:\s*cover;[\s\S]*?object-position:\s*center center;/);
  assert.match(editionCss, /\.edition-page \.edition-title\s*\{[^}]*font-family:\s*"Pretendard"[^}]*font-weight:\s*400 !important;[^}]*line-height:\s*1\.2 !important;/);
  assert.match(editionCss, /\.edition-page \.edition-desc\s*\{[^}]*font-family:\s*"Pretendard"[^}]*font-weight:\s*400 !important;[^}]*line-height:\s*1\.35 !important;/);
});

test("mobile navigation opens to half the viewport with larger labels", () => {
  assert.ok(cartPages.every((html) => html.includes("gnb-20260818-05.css?v=20260926-05")));
  assert.match(gnbCss, /@media \(max-width:\s*959px\)[\s\S]*?\.gnb__mobile-panel\s*\{[^}]*height:\s*50dvh;[^}]*min-height:\s*50dvh;/);
  assert.match(gnbCss, /\.gnb__mobile-item,[\s\S]*?\.gnb__mobile-actions \.gnb__action\s*\{[^}]*font-size:\s*18px;[^}]*line-height:\s*1\.2;/);
});

test("edition sidebar sticky stop uses media-relative image position", () => {
  assert.match(editionHtml, /edition-20260706-06\.js\?v=20260915-02/);
  assert.match(editionScript, /lastImage\.getBoundingClientRect\(\)\.top - mediaTop/);
  assert.doesNotMatch(editionScript, /lastImage\.offsetTop \+ stickyHeight/);
});

test("archive recommendations match the edition card grid", () => {
  assert.match(archiveScript, /relatedHeading\.textContent = "you may also like"/);
  assert.match(archiveCss, /\.archive-related h2\s*\{[\s\S]*?font-size:\s*16px/);
  assert.match(archiveCss, /\.archive-related \.archive-card__media\s*\{[\s\S]*?aspect-ratio:\s*1 \/ 1;/);
  assert.match(archiveCss, /@media \(min-width:\s*960px\)[\s\S]*?\.archive-related__grid\s*\{[\s\S]*?repeat\(4,/);
  assert.match(archiveCss, /object-position:\s*center center;/);
});

test("newsletter detail recommendations use columns one and two", () => {
  assert.match(newsletterScript, /heading\.textContent = "you may also like"/);
  assert.match(newsletterScript, /post\.slug !== currentSlug/);
  assert.match(newsletterCss, /\.newsletter-entry-mode \.newsletter-recommendation\s*\{[\s\S]*?grid-column:\s*1 \/ span 2;/);
  assert.match(newsletterCss, /\.newsletter-recommendation__title\s*\{[\s\S]*?font-size:\s*16px/);
  assert.match(newsletterCss, /\.newsletter-recommend-card__thumb\s*\{[\s\S]*?aspect-ratio:\s*1 \/ 1;/);
  assert.match(newsletterCss, /\.newsletter-recommend-card__thumb > \.progressive-image\s*\{[\s\S]*?height:\s*100%;/);
  assert.match(newsletterCss, /@media \(min-width:\s*960px\)[\s\S]*?\.newsletter-recommendation__grid\s*\{[\s\S]*?repeat\(4,/);
});

test("cart keeps its desktop label, hides the mobile label, and uses the large 16px item treatment", () => {
  assert.match(cartCss, /\.cart-panel__title\s*\{[^}]*font-family:\s*var\(--font-english-ui\);[^}]*font-size:\s*16px;/);
  assert.match(cartCss, /@media \(max-width:\s*480px\)[\s\S]*?\.cart-panel__title\s*\{[^}]*display:\s*none;/);
  assert.match(cartCss, /\.cart-item\s*\{[\s\S]*?min-height:\s*128px;/);
  assert.match(cartCss, /\.cart-item__img,[\s\S]*?\.cart-item__fallback\s*\{[\s\S]*?width:\s*128px;[\s\S]*?height:\s*128px;/);
  assert.match(cartCss, /\.cart-item__qty\s*\{[\s\S]*?min-height:\s*28px;[\s\S]*?font-size:\s*16px;[\s\S]*?line-height:\s*1;/);
  assert.match(cartCss, /\.cart-item__qty > span\s*\{[\s\S]*?height:\s*28px;[\s\S]*?align-items:\s*center;[\s\S]*?transform:\s*none;/);
  assert.match(cartCss, /\.cart-item__qty-btn\s*\{[\s\S]*?border:\s*1px solid #111;[\s\S]*?border-radius:\s*50%;[\s\S]*?font-size:\s*16px;/);
  assert.match(cartCss, /\.cart-item__remove\s*\{[\s\S]*?color:\s*#111;/);
  assert.match(cartCss, /\.cart-panel,[\s\S]*?\.cart-panel__footer\s*\{[^}]*background:\s*#fff;/);
  assert.match(cartCss, /\.cart-panel__header\s*\{[^}]*flex:\s*0 0 auto;[^}]*background:\s*#e34234;/);
  assert.match(cartCss, /\.cart-panel__footer\s*\{[^}]*box-shadow:\s*none;/);
  assert.match(cartCss, /\.cart-item__img\s*\{[^}]*object-fit:\s*contain;/);
  assert.match(cartCss, /\.cart-item__price,[\s\S]*?\.cart-panel__total\s*\{[^}]*font-weight:\s*400;/);
  assert.match(cartCss, /\.cart-panel__total\s*\{[^}]*padding-top:\s*12px;[^}]*border-top:\s*1px solid #111;/);
  assert.match(cartScript, /imageUrl\(image, \{ width: 512 \}\)/);
  assert.match(cartScript, /return `\$\{Number\(value\)\.toLocaleString\("ko-KR"\)\}원`;/);
  assert.doesNotMatch(cartScript, /formatPrice\(item\.price\)|formatPrice\(total\)/);
  assert.match(cartEntryScript, /cart-20260706-06\.js\?v=20260926-01/);
  cartPages.forEach((html, index) => {
    assert.match(html, /cart-20260818-02\.css\?v=20260926-03/, `stale cart stylesheet in ${cartPagePaths[index]}`);
    assert.match(html, /cart-20260818-02\.js\?v=20260926-01/, `stale cart script in ${cartPagePaths[index]}`);
  });
});

test("product overview copy stays stacked in the first desktop column", () => {
  assert.match(productHtml, /product\.css\?v=20260926-01/);
  assert.match(productHtml, /product\.js\?v=20260926-01/);
  assert.match(productScript, /\$\{editions\.length\}개 제작 \$\{displayPrice\}원/);
  assert.match(productCss, /\.product-overview\s*\{[^}]*gap:\s*16px;/);
  assert.match(productCss, /\.product-intro\s*\{[^}]*font-family:\s*"Pretendard"[^}]*font-size:\s*16px;[^}]*line-height:\s*1\.55;/);
  assert.match(productCss, /\.product-meta\s*\{[^}]*font-family:\s*"Pretendard"[^}]*font-size:\s*16px;[^}]*line-height:\s*1\.55;[^}]*color:\s*#111;/);
  assert.match(productCss, /@media \(min-width:\s*900px\)[\s\S]*?\.product-title,\s*\.product-intro,\s*\.product-meta\s*\{\s*grid-column:\s*1;/);
  assert.doesNotMatch(productCss, /\.product-intro\s*\{\s*grid-column:\s*2/);
  assert.doesNotMatch(productCss, /\.product-meta\s*\{\s*grid-column:\s*3/);
});

test("shared command buttons do not add a hover outline", () => {
  assert.doesNotMatch(actionsCss, /outline:\s*1px solid #111/);
  assert.doesNotMatch(actionsCss.slice(0, actionsCss.indexOf(") {")), /\.account-overview__link/);
  assert.match(actionsCss, /\.workshop-inquiry-form button\[type="submit"\][\s\S]*?:hover/);
  assert.match(actionsCss, /\.repair-ticket-file-button[\s\S]*?background:\s*#fff !important;[\s\S]*?color:\s*#111 !important;/);
  assert.doesNotMatch(actionsCss, /\.repair-ticket-file-button\s*\n\):hover[\s\S]*?background:\s*#111 !important/);
  assert.match(actionsCss, /:root body :is\([\s\S]*?\.repair-submit,[\s\S]*?\.cart-panel__checkout-btn,[\s\S]*?\.fulfillment-btn:not\(\.fulfillment-btn--secondary\)[\s\S]*?\):is\(:hover, :focus-visible, \.is-pointer-hover\)/);
  assert.doesNotMatch(actionsCss.slice(actionsCss.indexOf(":root body :is(")), /\.repair-ticket-file-button|\.repair-address-search-button/);
});

test("pointer hover restores card and button feedback without requiring a click", () => {
  assert.match(siteChromeScript, /document\.addEventListener\("pointerover"/);
  assert.match(siteChromeScript, /document\.addEventListener\("pointerout"/);
  assert.match(siteChromeScript, /event\.pointerType !== "mouse" && event\.pointerType !== "pen"/);
  assert.match(archiveCss, /\.archive-card\.is-pointer-hover \.archive-card__overlay\s*\{[^}]*opacity:\s*1;/);
  assert.match(newsletterCss, /\.newsletter-post-card\.is-pointer-hover \.newsletter-post-card__image\s*\{[^}]*transform:\s*scale\(1\.025\);/);
});

test("admin action controls retain their compact fulfillment sizing", async () => {
  const fulfillmentCss = await read("../runtime/storefront/styles/fulfillment.css");
  const workshopAdminCss = await read("../runtime/storefront/styles/workshop-admin-20260809-02.css");
  assert.match(fulfillmentCss, /\.fulfillment-btn\s*\{[\s\S]*?min-width:\s*108px;[\s\S]*?height:\s*38px/);
  assert.match(fulfillmentCss, /\.fulfillment-actions\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(workshopAdminCss, /\.workshop-admin-action-bar\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*wrap/);
  assert.doesNotMatch(actionsCss, /\.fulfillment-actions|\.workshop-admin-action-bar/);
});
