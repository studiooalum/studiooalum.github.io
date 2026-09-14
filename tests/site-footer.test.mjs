import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const footerSources = [
  "archive.html",
  "edition.html",
  "newsletter.html",
  "workshop.html",
  "workshops.html",
  "runtime/storefront/scripts/components/siteFooter.js",
];
const expectedLogoSource = "./oalum-logo.png";

test("every footer logo reference resolves to the ASCII asset", () => {
  assert.ok(existsSync(path.join(rootDir, "oalum-logo.png")), "missing oalum-logo.png");

  for (const relativePath of footerSources) {
    const source = readFileSync(path.join(rootDir, relativePath), "utf8");
    const logoReferences = [...source.matchAll(/<img\b[^>]*class="site-footer__logo-mark"[^>]*src="([^"]+)"[^>]*>/g)];

    assert.equal(logoReferences.length, 1, `${relativePath} should contain one footer logo`);
    assert.equal(logoReferences[0][1], expectedLogoSource, `${relativePath} should use the ASCII logo path`);
  }
});
