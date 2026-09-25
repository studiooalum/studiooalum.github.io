import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repairHtml = await readFile(new URL("../repair.html", import.meta.url), "utf8");
const repairCss = await readFile(
  new URL("../runtime/storefront/styles/repair-20260915-01.css", import.meta.url),
  "utf8",
);
const repairFormCss = await readFile(
  new URL("../runtime/storefront/styles/repair-20260922-01.css", import.meta.url),
  "utf8",
);
const repairDetailCss = await readFile(
  new URL("../runtime/storefront/styles/repair-20260925-01.css", import.meta.url),
  "utf8",
);
const repairRequestSource = await readFile(
  new URL("../runtime/storefront/scripts/repair-20260817-04-core.js", import.meta.url),
  "utf8",
);
const accountAddressApiSource = await readFile(new URL("../functions/api/auth/address.js", import.meta.url), "utf8");
const accountHtml = await readFile(new URL("../account.html", import.meta.url), "utf8");
const repairAdminSource = await readFile(new URL("../runtime/storefront/scripts/repair-admin.js", import.meta.url), "utf8");
const repairTicketSource = await readFile(new URL("../runtime/storefront/scripts/repair-ticket-20260824-01.js", import.meta.url), "utf8");
const repairTicketHtml = await readFile(new URL("../repair-ticket.html", import.meta.url), "utf8");
const repairAdminHtml = await readFile(new URL("../repair-admin.html", import.meta.url), "utf8");

test("repair page keeps the Figma accordion content contract", () => {
  assert.match(repairHtml, /repair-20260915-01\.css\?v=20260921-05/);
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

  assert.match(repairHtml, /<select class="js-repair-country" name="country"[^>]+required>[\s\S]*?<option value="대한민국" selected>/);
  assert.match(repairHtml, /js-repair-address-search[^>]*>주소 검색<\/button>/);
  assert.match(repairHtml, /t1\.kakaocdn\.net\/mapjsapi\/bundle\/postcode\/prod\/postcode\.v2\.js/);
  assert.match(repairHtml, /name="postalCode"[^>]+readonly required/);
  assert.match(repairHtml, /name="addressLine1"[^>]+readonly required/);
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

test("repair request supports postcode search, international entry, account autofill, and KR phone formatting", () => {
  assert.match(repairRequestSource, /new window\.daum\.Postcode/);
  assert.match(repairRequestSource, /dom\.postalCode\.readOnly = korean/);
  assert.match(repairRequestSource, /dom\.addressLine1\.readOnly = korean/);
  assert.match(repairHtml, /name="phone"[^>]+inputmode="numeric"[^>]+maxlength="11"[^>]+pattern="010\[0-9\]\{8\}"[^>]+placeholder="01000000000"/);
  assert.match(repairRequestSource, /dom\.phoneInput\.value = isKoreanAddress\(\)[\s\S]*?replace\(\/\\D\/g, ""\)/);
  assert.match(repairRequestSource, /accountUser\.fullName/);
  assert.match(repairRequestSource, /accountUser\.phone/);
  assert.match(accountAddressApiSource, /fullName: user\.fullName/);
  assert.match(accountAddressApiSource, /phone: user\.phone/);
});

test("country choices use Korean alphabetical order with a neutral direct-entry fallback", () => {
  const countrySelect = repairHtml.match(/<select class="js-repair-country"[\s\S]*?<\/select>/)?.[0] || "";
  const labels = [...countrySelect.matchAll(/<option value="(?!__direct__)[^"]+"(?: selected)?>([^<]+)<\/option>/g)].map((match) => match[1]);
  const sorted = [...labels].sort(new Intl.Collator("ko-KR").compare);
  assert.deepEqual(labels, sorted);
  assert.doesNotMatch(countrySelect, /기타 국가/);
  assert.match(countrySelect, /목록에 없는 국가 직접 입력/);
  assert.match(repairHtml, /name="countryCustom"/);
  assert.match(repairRequestSource, /countryCustom\.required = customCountry/);
  assert.match(repairFormCss, /\.repair-request-form \.repair-field\[hidden\]\s*\{[^}]*display:\s*none/);
});

test("repair photo-use notice appears in the optional request placeholder", () => {
  assert.match(repairHtml, /name="budgetNote"[^>]+placeholder="의뢰하신 의류의 수선 전후 이미지를 작업 아카이브나 SNS에 사용할 수 있습니다\. 원치 않으시면 기타 요청사항에 미리 말씀해 주세요\."/);
  assert.doesNotMatch(repairHtml, /name="archiveConsentChoice"/);
  assert.doesNotMatch(repairHtml, /작업 사진 기록/);
  assert.match(repairHtml, /name="privacyConsent" required/);
  assert.match(repairAdminSource, /archiveConsentStatus === "declined" \? "공개하지 않음" : "동의 확인 없음"/);
});

test("Repair Admin defaults to the Studio OALUM payment account", () => {
  assert.match(repairAdminHtml, /name="bankAccount"[^>]+value="국민 한아름 218301-04-144506"/);
});

test("Repair Ticket shows protected request images and hides lookup without a URL", () => {
  assert.match(repairTicketHtml, /js-repair-ticket-request-images/);
  assert.match(repairTicketSource, /repair\.requestImages/);
  assert.match(repairTicketSource, /data-protected-image-path/);
  assert.match(repairTicketSource, /trackingUrl \? `<div><dt>배송 조회<\/dt>/);
  assert.doesNotMatch(repairTicketSource, /\["배송",[^\n]+\|\| "미발송"\]/);
});

test("guest repair lookup number is provided consistently", () => {
  assert.match(accountHtml, /수선 접수 조회번호/);
  assert.match(accountHtml, /접수 완료 화면과 안내 이메일·문자에서 확인/);
  assert.match(repairRequestSource, /비회원 조회번호는 \$\{requestNumber\}입니다/);
  assert.match(repairTicketSource, /\["수선 접수 조회번호", repair\.requestNumber \|\| "-"\]/);
});

test("repair request close button has no hover box outline", () => {
  assert.match(repairCss, /\.repair-request-rail__close:hover\s*\{[^}]*outline:\s*none;[^}]*outline-offset:\s*0;/);
});

test("collapsed desktop accordion titles use compact spacing without changing open content", () => {
  assert.match(
    repairCss,
    /@media \(min-width:\s*960px\)[\s\S]*?\.repair-stage__rail \.repair-accordion:not\(\[open\]\) > summary\s*\{[^}]*min-height:\s*42px;[^}]*padding:\s*9px 0;/,
  );
  assert.match(repairCss, /\.repair-stage__rail \.repair-accordion > div\s*\{[^}]*padding:\s*0 0 24px;/);
});

test("repair introduction and accordion follow the archive body typography", () => {
  assert.doesNotMatch(repairHtml, /<h1 id="repair-title">Repair Studio<\/h1>/);
  assert.match(repairHtml, /<section class="repair-stage" aria-label="수선 안내">/);
  assert.match(repairHtml, /repair-20260925-01\.css\?v=20260925-04/);
  assert.match(repairDetailCss, /\.repair-stage__content\s*\{[^}]*padding-top:\s*0;/);
  assert.match(repairDetailCss, /body\.repair-page \.repair-body-copy p,[\s\S]*?font-family:\s*var\(--font-kor-body\) !important;[\s\S]*?font-size:\s*16px !important;[\s\S]*?font-weight:\s*400 !important;[\s\S]*?line-height:\s*1\.8 !important;/);
  assert.match(repairDetailCss, /body\.repair-page \.repair-stage__content \.repair-apply-btn\s*\{[^}]*width:\s*50% !important;[^}]*min-width:\s*0 !important;[^}]*justify-self:\s*start;/);
  assert.match(repairDetailCss, /\.repair-accordion > summary\s*\{[^}]*font-size:\s*16px !important;[^}]*font-weight:\s*400 !important;[^}]*line-height:\s*1\.45 !important;/);
  assert.match(repairDetailCss, /@media \(min-width:\s*960px\)[\s\S]*?\.repair-accordion > summary\s*\{[^}]*min-height:\s*42px;[^}]*padding:\s*9px 0;/);
  assert.match(repairDetailCss, /\.repair-basic-table tbody td,[\s\S]*?\.repair-method-matrix tbody th,[\s\S]*?\.repair-method-matrix tbody td,[\s\S]*?\.repair-process-list li,[\s\S]*?\.repair-accordion--shipping p[\s\S]*?font-size:\s*11px !important;[\s\S]*?line-height:\s*1\.45 !important/);
  assert.doesNotMatch(repairDetailCss, /:is\([^)]*(?:thead th|repair-price-notes|repair-process-note|repair-process-list span)/);
});
