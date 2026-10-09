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

test("shop and workshop policies match the current service rules", () => {
  const source = readFileSync(path.join(rootDir, "runtime/storefront/scripts/components/siteFooter.js"), "utf8");
  const versionedSource = readFileSync(path.join(rootDir, "runtime/storefront/scripts/components/siteFooter-20261003-01.js"), "utf8");

  assert.equal(versionedSource, source);
  assert.match(source, /배송 비용 : 주문 1건당 4,000원/);
  assert.match(source, /별도 배송비 공제 없이 실제 결제 금액 전액을 환불/);
  assert.doesNotMatch(source, /배송비 4,000원을 공제/);
  assert.doesNotMatch(source, /왕복 배송비 8,000원/);
  assert.match(source, /반품 상품을 반환받은 날부터 3영업일 이내/);
  assert.match(source, /별도로 고지하고 소비자의 전자 동의를 받은 경우/);
  assert.match(source, /제18조\(워크숍 예약·변경·취소\)/);
  assert.match(source, /워크숍 시작 전에 예약을 취소하는 경우 참가비 전액을 환급/);
  assert.match(source, /제19조\(수선 서비스\)/);
  assert.match(source, /이용자가 동의한 때 수선 계약이 확정/);
  assert.match(source, /2026년 10월 3일부터 시행/);
  assert.doesNotMatch(source, /기본 3,500원|10만 원 이상 구매 시 무료|왕복 배송비\(6,000원\)/);
});
