import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [queries, catalog, shopHtml, productHtml, editionHtml, shopScript, productScript, editionScript] = await Promise.all([
  read("../runtime/storefront/scripts/sanity/queries.js"),
  read("../runtime/storefront/scripts/utils/catalog.js"),
  read("../shop.html"),
  read("../product.html"),
  read("../edition.html"),
  read("../runtime/storefront/scripts/shop.js"),
  read("../runtime/storefront/scripts/product.js"),
  read("../runtime/storefront/scripts/edition-20260706-06.js"),
]);

test("storefront reads the current product schema without the removed category field", () => {
  assert.doesNotMatch(queries, /^\s*category,\s*$/m);
  assert.match(queries, /^\s*shopTags,\s*$/m);
  assert.match(queries, /^\s*size,\s*$/m);
  assert.match(queries, /^\s*material,\s*$/m);
  assert.doesNotMatch(catalog, /product\?\.category/);
  assert.match(catalog, /product\?\.shopTags/);
});

test("storefront cache versions expose the schema change immediately", () => {
  assert.match(shopHtml, /shop\.js\?v=20261001-01/);
  assert.match(productHtml, /product\.js\?v=20260927-01/);
  assert.match(editionHtml, /edition-20260706-06\.js\?v=20260927-02/);
  assert.match(shopScript, /queries\.js\?v=20260927-01/);
  assert.match(productScript, /queries\.js\?v=20260927-01/);
  assert.match(editionScript, /queries\.js\?v=20260927-01/);
});

test("sold-out Patchwork Strap Beanie is removed from the Shop listing only", () => {
  assert.match(shopScript, /HIDDEN_SHOP_PRODUCT_NAMES[\s\S]*"patchwork strap beanie"/);
  assert.match(shopScript, /products\.filter\(isVisibleShopProduct\)/);
});
