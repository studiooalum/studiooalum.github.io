import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("archive cards use equal-gap masonry without changing newest-first source order", async () => {
  const [html, css, source] = await Promise.all([
    read("../archive.html"),
    read("../runtime/storefront/styles/archive-20260818-02.css"),
    read("../runtime/storefront/scripts/archive-20260816-06.js"),
  ]);

  assert.match(html, /archive-20260818-02\.css\?v=20260927-01/);
  assert.match(html, /archive-20260924\.js\?v=20260927-01/);
  assert.match(css, /\.archive-board \{[^}]*grid-auto-rows: 1px;[^}]*column-gap: var\(--grid-gap\);[^}]*row-gap: var\(--grid-gap\);/);
  assert.match(source, /function layoutArchiveMasonry\(board\)/);
  assert.match(source, /Math\.ceil\(\(cardHeight \+ rowGap\) \/ \(rowHeight \+ rowGap\)\)/);
  assert.match(source, /image\.addEventListener\("load", \(\) => scheduleArchiveMasonry/);
  assert.match(source, /window\.addEventListener\("resize", \(\) => scheduleArchiveMasonry/);
  assert.match(source, /sortArchiveNewestFirst/);
});
