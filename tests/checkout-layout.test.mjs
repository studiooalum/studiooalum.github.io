import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [html, css, checkoutScript, archiveSource] = await Promise.all([
  read("../checkout.html"),
  read("../runtime/storefront/styles/checkout.css"),
  read("../runtime/storefront/scripts/checkout.js"),
  read("../runtime/storefront/scripts/archive-20260816-06.js"),
]);

test("checkout follows the two-column repair form layout", () => {
  assert.match(html, /checkout\.css\?v=20260926-03/);
  assert.match(html, />주문 내역</);
  assert.match(html, />배송 정보</);
  assert.match(html, />전화번호 <span class="required">\*<\/span>/);
  assert.match(html, />국가 <span class="required">\*<\/span>/);
  assert.match(html, /checkout-field__value">대한민국/);
  assert.match(html, />주소검색<\/button>/);
  assert.match(html, /placeholder="쿠폰 코드 입력하기"/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.checkout-field, \.checkout-field--fixed \{[^}]*border-bottom: 1px solid #111/);
  assert.match(css, /\.checkout-item \{[^}]*grid-template-columns: 184px minmax\(0, 1fr\)/);
  assert.match(css, /\.checkout-summary > \.checkout-totals \{ margin-top: 20px; \}/);
  assert.match(css, /\.checkout-field__zip-row \{[^}]*justify-content: flex-start;/);
  assert.match(css, /\.checkout-field__zip-row input \{[^}]*position: absolute;[^}]*clip-path: inset\(50%\);/);
  assert.match(css, /\.checkout-submit-btn \{[^}]*background: #111;[^}]*font: 400 16px/);
  assert.match(checkoutScript, /function formatWon\(value\)/);
  assert.match(checkoutScript, /couponRow\.hidden = false/);
  assert.match(checkoutScript, /pointsRow\.hidden = false/);
});

test("archive is explicitly sorted newest first after normalization", () => {
  assert.match(archiveSource, /order\(createdDate desc, _createdAt desc\)/);
  assert.match(archiveSource, /function sortArchiveNewestFirst\(items\)/);
  assert.match(archiveSource, /getArchiveDateValue\(right\.createdDate\) - getArchiveDateValue\(left\.createdDate\)/);
  assert.match(archiveSource, /getArchiveDateValue\(right\.createdAt\) - getArchiveDateValue\(left\.createdAt\)/);
  assert.match(archiveSource, /state\.items = sortArchiveNewestFirst\(/);
});
