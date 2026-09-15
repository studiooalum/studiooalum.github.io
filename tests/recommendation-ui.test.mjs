import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [editionCss, archiveScript, archiveCss, newsletterScript, newsletterCss, cartCss] = await Promise.all([
  read("../runtime/storefront/styles/edition.css"),
  read("../runtime/storefront/scripts/archive-20260818-02.js"),
  read("../runtime/storefront/styles/archive-20260818-02.css"),
  read("../runtime/storefront/scripts/newsletter-20260818-02.js"),
  read("../runtime/storefront/styles/newsletter-20260818-03.css"),
  read("../runtime/storefront/styles/cart-20260818-02.css"),
]);

test("edition recommendations crop square images from the center", () => {
  assert.match(editionCss, /\.edition-recommend-card__thumb img\s*\{[\s\S]*?object-fit:\s*cover;[\s\S]*?object-position:\s*center center;/);
});

test("archive recommendations match the edition card grid", () => {
  assert.match(archiveScript, /relatedHeading\.textContent = "you may also like"/);
  assert.match(archiveCss, /\.archive-related \.archive-card__media\s*\{[\s\S]*?aspect-ratio:\s*1 \/ 1;/);
  assert.match(archiveCss, /@media \(min-width:\s*960px\)[\s\S]*?\.archive-related__grid\s*\{[\s\S]*?repeat\(4,/);
  assert.match(archiveCss, /object-position:\s*center center;/);
});

test("newsletter detail recommendations use columns one and two", () => {
  assert.match(newsletterScript, /heading\.textContent = "you may also like"/);
  assert.match(newsletterScript, /post\.slug !== currentSlug/);
  assert.match(newsletterCss, /\.newsletter-entry-mode \.newsletter-recommendation\s*\{[\s\S]*?grid-column:\s*1 \/ span 2;/);
  assert.match(newsletterCss, /\.newsletter-recommend-card__thumb\s*\{[\s\S]*?aspect-ratio:\s*1 \/ 1;/);
  assert.match(newsletterCss, /@media \(min-width:\s*960px\)[\s\S]*?\.newsletter-recommendation__grid\s*\{[\s\S]*?repeat\(4,/);
});

test("cart quantity controls share one vertical center", () => {
  assert.match(cartCss, /\.cart-item__qty\s*\{[\s\S]*?min-height:\s*22px;[\s\S]*?line-height:\s*1;/);
  assert.match(cartCss, /\.cart-item__qty > span\s*\{[\s\S]*?height:\s*22px;[\s\S]*?align-items:\s*center;/);
  assert.match(cartCss, /\.cart-item__qty-btn\s*\{[\s\S]*?padding:\s*0;[\s\S]*?line-height:\s*1;/);
});