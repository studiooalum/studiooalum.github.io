import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [html, css, checkoutScript, archiveSource, accountHtml, accountCss] = await Promise.all([
  read("../checkout.html"),
  read("../runtime/storefront/styles/checkout.css"),
  read("../runtime/storefront/scripts/checkout.js"),
  read("../runtime/storefront/scripts/archive-20260816-06.js"),
  read("../account.html"),
  read("../runtime/storefront/styles/account.css"),
]);

test("checkout follows the three-column repair form layout", () => {
  assert.match(html, /checkout\.css\?v=20260927-04/);
  assert.match(html, />주문 내역</);
  assert.match(html, />배송 정보</);
  assert.match(html, />전화번호 <span class="required">\*<\/span>/);
  assert.match(html, />국가 <span class="required">\*<\/span>/);
  assert.match(html, /checkout-field__value">대한민국/);
  assert.match(html, />주소검색<\/button>/);
  assert.match(html, /placeholder="쿠폰 코드 입력하기"/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.checkout-summary \{ grid-column: 1;/);
  assert.match(css, /\.checkout-form-section \{ grid-column: 2;/);
  assert.match(css, /\.checkout-field, \.checkout-field--fixed \{[^}]*border-bottom: 1px solid #111/);
  assert.match(css, /\.checkout-item \{[^}]*grid-template-columns: 184px minmax\(0, 1fr\)/);
  assert.match(css, /\.checkout-summary > \.checkout-totals \{ margin-top: 20px; \}/);
  assert.match(css, /\.checkout-totals \{[^}]*padding-top: 0;/);
  assert.match(css, /\.checkout-totals__row \{[^}]*align-items: center;[^}]*min-height: 33\.75px;[^}]*padding: 0;/);
  assert.match(css, /\.checkout-totals__row--total \{[^}]*margin-top: 0;/);
  assert.match(css, /\.checkout-field__zip-row \{[^}]*justify-content: flex-start;/);
  assert.match(css, /\.checkout-field__zip-row input \{[^}]*position: absolute;[^}]*clip-path: inset\(50%\);/);
  assert.match(css, /\.checkout-submit-btn \{[^}]*background: #111;[^}]*font: 400 16px/);
  assert.match(css, /\.checkout-coupon__controls input \{[^}]*height: 68px;[^}]*min-height: 68px;/);
  assert.match(css, /\.checkout-summary > \.checkout-coupon \{ margin-top: 23px; \}/);
  assert.match(css, /\.checkout-points \{[^}]*width: 100%;/);
  assert.match(css, /input\[type="number"\]::-webkit-inner-spin-button/);
  assert.match(html, /checkoutCouponSection[\s\S]*checkoutPointsSection[\s\S]*checkout-form-section/);
  assert.match(html, /checkoutPointsBalance">보유 포인트 0</);
  assert.match(checkoutScript, /`보유 포인트 \$\{availablePoints\.toLocaleString\("ko-KR"\)\}`/);
  assert.match(css, /#searchZipBtn \{[^}]*width: auto !important;[^}]*justify-content: flex-start !important;/);
  assert.match(css, /input\[type="checkbox"\]:checked[^}]*background-image: url\("data:image\/svg\+xml/);
  assert.match(css, /padding: calc\(var\(--gnb-height, 40px\) \+ var\(--page-top-space, 72px\)\)/);
  assert.match(checkoutScript, /function formatWon\(value\)/);
  assert.match(checkoutScript, /imageUrl\(image, \{ width: 512 \}\)/);
  assert.match(checkoutScript, /couponRow\.hidden = false/);
  assert.match(checkoutScript, /pointsRow\.hidden = false/);
});

test("account and checkout share the standard page-top spacing", () => {
  assert.match(accountHtml, /account\.css\?v=20260926-05/);
  assert.match(accountCss, /@media \(max-width: 959px\)[\s\S]*?\.account-main \{\s*padding-top: calc\(var\(--gnb-height, 40px\) \+ var\(--page-top-space\)\);/);
});

test("archive is explicitly sorted newest first after normalization", () => {
  assert.match(archiveSource, /order\(createdDate desc, _createdAt desc\)/);
  assert.match(archiveSource, /function sortArchiveNewestFirst\(items\)/);
  assert.match(archiveSource, /getArchiveDateValue\(right\.createdDate\) - getArchiveDateValue\(left\.createdDate\)/);
  assert.match(archiveSource, /getArchiveDateValue\(right\.createdAt\) - getArchiveDateValue\(left\.createdAt\)/);
  assert.match(archiveSource, /state\.items = sortArchiveNewestFirst\(/);
});
