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
const [editionHtml, editionScript, editionCss, archiveScript, archiveCss, newsletterScript, newsletterCss, cartCss, productCss, actionsCss] = await Promise.all([
  read("../edition.html"),
  read("../runtime/storefront/scripts/edition-20260706-06.js"),
  read("../runtime/storefront/styles/edition.css"),
  read("../runtime/storefront/scripts/archive-20260818-02.js"),
  read("../runtime/storefront/styles/archive-20260818-02.css"),
  read("../runtime/storefront/scripts/newsletter-20260818-02.js"),
  read("../runtime/storefront/styles/newsletter-20260818-03.css"),
  read("../runtime/storefront/styles/cart-20260818-02.css"),
  read("../runtime/storefront/styles/product.css"),
  read("../runtime/storefront/styles/actions-20260924.css"),
]);
const cartPages = await Promise.all(cartPagePaths.map((path) => read(`../${path}`)));

test("edition recommendations crop square images from the center", () => {
  assert.match(editionHtml, /edition\.css\?v=20260915-02/);
  assert.match(editionCss, /\.edition-recommend-card__thumb > \.progressive-image\s*\{[\s\S]*?height:\s*100%;/);
  assert.match(editionCss, /\.edition-recommend-card__thumb img\s*\{[\s\S]*?object-fit:\s*cover;[\s\S]*?object-position:\s*center center;/);
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

test("cart quantity controls share one vertical center", () => {
  assert.match(cartCss, /\.cart-item__qty\s*\{[\s\S]*?min-height:\s*22px;[\s\S]*?line-height:\s*1;/);
  assert.match(cartCss, /\.cart-item__qty > span\s*\{[\s\S]*?height:\s*22px;[\s\S]*?align-items:\s*center;[\s\S]*?transform:\s*translateY\(1px\);/);
  assert.match(cartCss, /\.cart-item__qty-btn\s*\{[\s\S]*?padding:\s*0;[\s\S]*?font-size:\s*11px;[\s\S]*?line-height:\s*1;/);
  cartPages.forEach((html, index) => {
    assert.match(html, /cart-20260818-02\.css\?v=20260925-03/, `stale cart stylesheet in ${cartPagePaths[index]}`);
  });
});

test("product overview copy stays stacked in the first desktop column", () => {
  assert.match(productCss, /@media \(min-width:\s*900px\)[\s\S]*?\.product-title,\s*\.product-intro,\s*\.product-meta\s*\{\s*grid-column:\s*1;/);
  assert.doesNotMatch(productCss, /\.product-intro\s*\{\s*grid-column:\s*2/);
  assert.doesNotMatch(productCss, /\.product-meta\s*\{\s*grid-column:\s*3/);
});

test("shared command buttons do not add a hover outline", () => {
  assert.doesNotMatch(actionsCss, /outline:\s*1px solid #111/);
  assert.doesNotMatch(actionsCss.slice(0, actionsCss.indexOf(") {")), /\.account-overview__link/);
});

test("admin action controls retain their compact fulfillment sizing", async () => {
  const fulfillmentCss = await read("../runtime/storefront/styles/fulfillment.css");
  const workshopAdminCss = await read("../runtime/storefront/styles/workshop-admin-20260809-02.css");
  assert.match(fulfillmentCss, /\.fulfillment-btn\s*\{[\s\S]*?min-width:\s*108px;[\s\S]*?height:\s*38px/);
  assert.match(fulfillmentCss, /\.fulfillment-actions\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(workshopAdminCss, /\.workshop-admin-action-bar\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*wrap/);
  assert.doesNotMatch(actionsCss, /\.fulfillment-btn|\.fulfillment-actions|\.workshop-admin-action-bar/);
});
