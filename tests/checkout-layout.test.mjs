import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [html, css, checkoutScript, versionedCheckoutScript, archiveSource, accountHtml, accountCss] = await Promise.all([
  read("../checkout.html"),
  read("../runtime/storefront/styles/checkout.css"),
  read("../runtime/storefront/scripts/checkout.js"),
  read("../runtime/storefront/scripts/checkout-20261003-01.js"),
  read("../runtime/storefront/scripts/archive-20260816-06.js"),
  read("../account.html"),
  read("../runtime/storefront/styles/account.css"),
]);

test("checkout follows the three-column repair form layout", () => {
  assert.equal(versionedCheckoutScript, checkoutScript);
  assert.match(html, /checkout-20261003-01\.js/);
  assert.match(html, /checkout\.css\?v=20260930-validation-01/);
  assert.match(html, />주문 내역</);
  assert.match(html, />배송 정보</);
  assert.doesNotMatch(html, /<span class="required">\*<\/span>/);
  assert.match(html, /checkout-field__value">대한민국/);
  assert.match(html, />주소검색<\/button>/);
  assert.match(html, /placeholder="쿠폰 코드 입력하기"/);
  assert.match(html, /name="phone"[^>]+placeholder="010-0000-0000"[^>]+maxlength="13"[^>]+pattern="010-\[0-9\]\{4\}-\[0-9\]\{4\}"/);
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
  assert.match(css, /\.checkout-coupon__controls input \{[^}]*height: 68px;[^}]*min-height: 68px;[^}]*border: 0;[^}]*border-bottom: 1px solid #111;/);
  assert.match(css, /\.checkout-summary > \.checkout-coupon \{ margin-top: 23px; \}/);
  assert.match(css, /\.checkout-points \{[^}]*width: 100%;[^}]*margin-top: 0;[^}]*padding: 0;[^}]*border: 0;/);
  assert.match(css, /\.checkout-points__controls \{[^}]*min-height: 68px;[^}]*border-bottom: 1px solid #111;/);
  assert.match(css, /input\[type="number"\]::-webkit-inner-spin-button/);
  assert.match(html, /checkoutCouponSection[\s\S]*checkoutPointsSection[\s\S]*checkout-form-section/);
  assert.match(html, /checkoutPointsBalance">보유 포인트 0</);
  assert.match(html, /data-checkout-policy="shipping">배송 환불 적립금 안내/);
  assert.match(html, /placeholder="포인트는 1,000포인트부터 사용할 수 있습니다"/);
  assert.doesNotMatch(html, /checkout-points__title|checkoutPointsCopy|checkoutPointsEarn|checkoutCouponCopy/);
  assert.match(checkoutScript, /`보유 포인트 \$\{availablePoints\.toLocaleString\("ko-KR"\)\}`/);
  assert.match(css, /#searchZipBtn \{[^}]*width: auto !important;[^}]*justify-content: flex-start !important;/);
  assert.match(css, /input\[type="checkbox"\]:checked[^}]*background-image: url\("data:image\/svg\+xml/);
  assert.match(css, /padding: calc\(var\(--gnb-height, 40px\) \+ var\(--page-top-space, 72px\)\)/);
  assert.match(checkoutScript, /function formatWon\(value\)/);
  assert.match(html, /checkoutShipping">4,000원</);
  assert.match(checkoutScript, /const SHOP_SHIPPING_AMOUNT = 4000/);
  assert.match(checkoutScript, /checkoutShipping"\)\.textContent = formatWon\(totals\.shippingAmount\)/);
  assert.match(checkoutScript, /imageUrl\(image, \{ width: 512 \}\)/);
  assert.match(checkoutScript, /couponRow\.hidden = false/);
  assert.match(checkoutScript, /pointsRow\.hidden = false/);
  assert.match(checkoutScript, /function formatKoreanPhone\(value\)/);
  assert.match(checkoutScript, /form\.classList\.toggle\("is-validation-visible"/);
  assert.doesNotMatch(checkoutScript, /alert\("필수 항목을 모두 입력해주세요\."\)/);
  assert.match(css, /\.checkout-form\.is-validation-visible \.checkout-field\.is-invalid/);
});

test("account and checkout share the standard page-top spacing", () => {
  assert.match(accountHtml, /account-20261002-07\.css/);
  assert.match(accountCss, /@media \(max-width: 959px\)[\s\S]*?\.account-main \{\s*padding-top: calc\(var\(--gnb-height, 40px\) \+ var\(--page-top-space\)\);/);
});

test("archive is explicitly sorted newest first after normalization", () => {
  assert.match(archiveSource, /order\(createdDate desc, _createdAt desc\)/);
  assert.match(archiveSource, /function sortArchiveNewestFirst\(items\)/);
  assert.match(archiveSource, /getArchiveDateValue\(right\.createdDate\) - getArchiveDateValue\(left\.createdDate\)/);
  assert.match(archiveSource, /getArchiveDateValue\(right\.createdAt\) - getArchiveDateValue\(left\.createdAt\)/);
  assert.match(archiveSource, /state\.items = sortArchiveNewestFirst\(/);
});
