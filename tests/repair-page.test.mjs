import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repairHtml = await readFile(new URL("../repair.html", import.meta.url), "utf8");
const repairCss = await readFile(
  new URL("../runtime/storefront/styles/repair-20260915-01.css", import.meta.url),
  "utf8",
);

test("repair page keeps the Figma accordion content contract", () => {
  assert.match(repairHtml, /repair-20260915-01\.css\?v=20260920-03/);
  assert.deepEqual(
    [...repairHtml.matchAll(/<summary>([^<]+)<\/summary>/g)].slice(0, 3).map((match) => match[1]),
    ["가격 및 견적", "접수 및 진행", "배송 및 결제"],
  );

  for (const text of [
    "Basic",
    "Repair Methods",
    "자켓</td><td>₩25,000~",
    "가죽</td><td>₩50,000~",
    "하나의 제품에 여러 가지 리페어 기법이 함께 사용되는 경우 별도 견적이 진행될 수 있습니다.",
    "신청폼 접수 후 답변은 1~2 영업일 정도 소요되고 있으니 양해 부탁드립니다.",
    "왕복 배송비는 고객 부담입니다.",
    "작업 완료 후 안내드리는 금액을 입금해 주세요.",
  ]) {
    assert.ok(repairHtml.includes(text), `missing accordion copy: ${text}`);
  }

  assert.equal((repairHtml.match(/<li><span>0[1-5]<\/span>/g) || []).length, 5);
});

test("repair accordion uses the three-column rail and Figma typography", () => {
  assert.match(repairCss, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(repairCss, /\.repair-stage__rail\s*\{[\s\S]*?grid-column:\s*3;/);
  assert.match(repairCss, /--repair-accordion-summary-height:\s*53px/);
  assert.match(repairCss, /font-size:\s*18px/);
  assert.match(repairCss, /--repair-price-row-height:\s*36px/);
  assert.match(repairCss, /\.repair-process-list\s*\{[\s\S]*?gap:\s*7px/);
  assert.match(repairCss, /\.repair-accordion--shipping > div\s*\{[\s\S]*?gap:\s*10px/);
});

test("repair accordion keeps summary geometry stable when toggled", () => {
  assert.doesNotMatch(repairCss, /:has\(\.repair-accordion\[open\]\)/);
  assert.match(
    repairCss,
    /\.repair-stage__rail \.repair-accordion > summary\s*\{[\s\S]*?min-height:\s*var\(--repair-accordion-summary-height\);[\s\S]*?padding:\s*15px 0;[\s\S]*?font-family:\s*var\(--font-kor-body\);[\s\S]*?line-height:\s*22px/,
  );
});

test("Repair Methods matches Basic typography without a forced panel height", () => {
  assert.match(repairCss, /\.repair-method-matrix\s*\{[^}]*font-size:\s*13px;[^}]*line-height:\s*15px;/);
  assert.match(repairCss, /\.repair-method-matrix thead th\s*\{[^}]*font-size:\s*11px;/);
  assert.match(repairCss, /\.repair-method-matrix th,\s*\.repair-stage__rail \.repair-method-matrix td\s*\{[^}]*height:\s*auto;[^}]*padding:\s*10px 4px;/);
  assert.match(repairCss, /\.repair-price-panel\[data-repair-price-panel="methods"\]\s*\{[^}]*min-height:\s*0;[^}]*overflow-x:\s*auto;/);
  assert.match(repairCss, /\.repair-method-matrix tbody td:not\(:first-child\)\s*\{[^}]*font-size:\s*13px;[^}]*font-weight:\s*400;[^}]*letter-spacing:\s*inherit;/);
  assert.doesNotMatch(repairCss, /@media \(max-width:\s*768px\)[\s\S]*?\.repair-stage__rail \.repair-method-matrix\s*\{[^}]*font-size:\s*8px;/);
});

test("the shared pricing notes use compact readable line and paragraph spacing", () => {
  assert.match(repairCss, /\.repair-stage__rail \.repair-price-notes\s*\{[^}]*gap:\s*4px;[^}]*font-size:\s*11px;[^}]*line-height:\s*16px;/);
  assert.equal((repairHtml.match(/class="repair-price-notes"/g) || []).length, 1);
});

test("repair accordion omits section divider lines at every viewport", () => {
  const sectionSelectors = new Set([
    ".repair-stage__rail",
    ".repair-stage__rail .repair-accordion",
    ".repair-stage__rail .repair-accordion + .repair-accordion",
    ".repair-stage__rail .repair-accordion:last-child",
  ]);
  const sectionRules = [...repairCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((match) =>
    match[1].split(",").some((selector) => sectionSelectors.has(selector.trim())),
  );

  assert.ok(sectionRules.length >= 3);
  for (const [, selector, declarations] of sectionRules) {
    assert.doesNotMatch(
      declarations,
      /(?:border-top|border-bottom):\s*(?!0(?:[;\s}]|$))[^;]+/,
      `unexpected accordion divider in ${selector.trim()}`,
    );
  }
  assert.match(repairCss, /\.repair-stage__rail\s*\{[\s\S]*?border:\s*0;/);
  assert.match(repairCss, /@media \(max-width:\s*768px\)[\s\S]*?\.repair-stage__rail[\s\S]*?border:\s*0;/);
});

test("repair request separates applicant and shipping fields without changing questions 1–5", () => {
  for (const field of [
    '<span>이름</span>',
    '<span>전화번호</span>',
    '<span>이메일 주소</span>',
    '<span>국가</span>',
    '<span>우편번호</span>',
    '<span>주소</span>',
    '<span>상세주소</span>',
  ]) {
    assert.ok(repairHtml.includes(field), `missing request field: ${field}`);
  }

  assert.match(repairHtml, /name="country"[^>]+value="대한민국"[^>]+required/);
  assert.doesNotMatch(repairHtml, /저장된 내 주소 없음|js-repair-use-account-address/);
  assert.deepEqual(
    [...repairHtml.matchAll(/<(?:span|legend|h3)>([1-5]\. [^<]+)/g)].map((match) => match[1]),
    [
      "1. 어떤 제품인가요?",
      "2. 어떤 부분이 손상되었나요?",
      "3. 원하시는 방향이 있나요?",
      "4. 제품 사진을 올려주세요. ",
      "5. 기타 요청사항 ",
    ],
  );
});
