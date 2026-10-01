import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

test("sitewide validation uses the Toss red error token", async () => {
  const [variables, accountHtml, repairHtml] = await Promise.all([
    read("runtime/storefront/styles/variables-20260818-01.css"),
    read("account.html"),
    read("repair.html"),
  ]);

  assert.match(variables, /--color-error:\s*#f04452;/);
  assert.match(accountHtml, /variables-20260818-01\.css\?v=20260930-error-01/);
  assert.match(repairHtml, /variables-20260818-01\.css\?v=20260930-error-01/);
});

test("Newsletter Admin loads only the versioned Tiptap editor", async () => {
  const [html, controller, stylesheet, editorSource, bundle, packageJson] = await Promise.all([
    read("newsletter-admin.html"),
    read("runtime/storefront/scripts/newsletter-admin.js"),
    read("runtime/storefront/styles/newsletter-admin-20260910-03.css"),
    read("runtime/storefront/scripts/components/newsletter-tiptap-editor.jsx"),
    read("runtime/storefront/scripts/newsletter-admin-20260910-04.js"),
    read("package.json"),
  ]);

  assert.match(html, /newsletter-admin-20260910-04\.js/);
  assert.match(html, /newsletter-admin-20260910-03\.css/);
  assert.match(html, /data-newsletter-editor-pending/);
  assert.match(html, /window\.setTimeout[\s\S]*8000/);
  assert.match(controller, /components\/newsletter-tiptap-editor\.jsx/);
  assert.match(packageJson, /newsletter-admin-20260910-04\.js/);
  assert.doesNotMatch(bundle, /^\s*import\s/m);
  assert.match(editorSource, /<EditorContent editor=\{editor\}/);
  assert.match(editorSource, /NewsletterEditorErrorBoundary/);
  assert.match(editorSource, /imageAttributes\["data-progressive-image"\] = "false"/);
  assert.match(editorSource, /STYLE_OPTIONS[\s\S]*Normal text[\s\S]*Heading \$\{level\}/);
  assert.match(editorSource, /heading:\s*\{ levels:\s*\[1, 2, 3, 4, 5, 6\] \}/);
  assert.doesNotMatch(editorSource, /aria-label="폰트"/);
  assert.doesNotMatch(editorSource, /PRIMARY_FONT_OPTIONS|SECONDARY_FONT_OPTIONS/);
  assert.match(editorSource, /<StyleDropdown editor=\{editor\}/);
  assert.match(editorSource, /function ToolIcon/);
  assert.match(editorSource, /type:\s*"newsletterGallery"/);
  assert.match(editorSource, /data-image-gallery/);
  assert.match(editorSource, /<ToolIcon name="image"/);
  assert.match(editorSource, /accept="image\/jpeg,image\/png,image\/webp,image\/gif,image\/avif"[\s\S]*multiple/);
  assert.doesNotMatch(editorSource, /type="number"/);
  assert.doesNotMatch(editorSource, />Tx</);
  assert.match(editorSource, /resize:\s*\{[\s\S]*enabled:\s*true/);
  assert.match(editorSource, /alwaysPreserveAspectRatio:\s*true/);
  assert.match(editorSource, /setImage\(\{ src: imageUrls\[0\]/);
  assert.match(stylesheet, /\.newsletter-admin-toolbar\s*\{[\s\S]*position:\s*sticky;[\s\S]*top:\s*calc\(var\(--gnb-height, 40px\) - 1px\);/);
  assert.match(stylesheet, /\.newsletter-admin-style-menu__popover/);
  assert.match(stylesheet, /figure\[data-image-gallery="true"\]/);
  assert.match(stylesheet, /\.newsletter-admin-editor p,[\s\S]*?\.newsletter-admin-preview p\s*\{\s*margin:\s*0;/);
  assert.match(stylesheet, /\.newsletter-admin-editor\s*\{[\s\S]*?font-family:\s*"Pretendard", sans-serif;[\s\S]*?font-size:\s*18px;[\s\S]*?font-weight:\s*300;[\s\S]*?line-height:\s*1\.65;/);
  assert.match(stylesheet, /\.newsletter-admin-preview\s*\{[\s\S]*?font-family:\s*"Pretendard", sans-serif;[\s\S]*?font-size:\s*18px;[\s\S]*?font-weight:\s*300;[\s\S]*?line-height:\s*1\.65;/);
  assert.match(stylesheet, /@media \(min-width:\s*960px\)[\s\S]*?\.newsletter-admin-editor\s*\{[^}]*width:\s*min\(100%, 730px\);/);
  assert.match(stylesheet, /@media \(min-width:\s*960px\)[\s\S]*?\.newsletter-admin-editor\s*\{[^}]*font-size:\s*16px;[\s\S]*?\.newsletter-admin-preview\s*\{[^}]*font-size:\s*16px;/);
  assert.match(stylesheet, /\.newsletter-admin-editor > img,[\s\S]*?\.newsletter-admin-editor > \[data-resize-container\] img\s*\{\s*width:\s*100% !important;/);
  assert.match(stylesheet, /\.newsletter-admin-editor p \+ p,[\s\S]*?margin-top:\s*0;/);
  await assert.rejects(access(new URL("runtime/storefront/scripts/newsletter-admin.bundle.js", root)));
  await assert.rejects(access(new URL("runtime/storefront/scripts/newsletter-tiptap-editor-20260910-01.js", root)));
});

test("Newsletter detail uses the center grid with gallery and image zoom", async () => {
  const [html, controller, stylesheet, layoutStylesheet] = await Promise.all([
    read("newsletter.html"),
    read("runtime/storefront/scripts/newsletter-20260818-02.js"),
    read("runtime/storefront/styles/newsletter-20260818-03.css"),
    read("runtime/storefront/styles/newsletter-20260818-01.css"),
  ]);

  assert.match(html, /newsletter-20260818-03\.css\?v=20260930-06/);
  assert.match(html, /newsletter-20260818-02\.js\?v=20260915-01/);
  assert.match(layoutStylesheet, /\.newsletter-entry-mode \.newsletter-entry\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 634px\) minmax\(0, 1fr\)/);
  assert.match(layoutStylesheet, /\.newsletter-entry-mode \.newsletter-entry > \*[\s\S]*grid-column:\s*2/);
  assert.match(stylesheet, /figure\[data-image-gallery="true"\][\s\S]*grid-template-columns:\s*repeat\(2/);
  assert.match(stylesheet, /\.newsletter-entry__content\s*\{[^}]*font-family:\s*"Pretendard", sans-serif;[^}]*font-size:\s*18px;[^}]*font-weight:\s*300;[^}]*line-height:\s*1\.65;/);
  assert.match(stylesheet, /@media \(min-width:\s*960px\)[\s\S]*?\.newsletter-entry__content\s*\{[^}]*font-size:\s*16px;/);
  assert.match(controller, /function enhanceEntryImages/);
  assert.match(controller, /data-newsletter-lightbox-close/);
  assert.match(controller, /lockBodyScroll\("newsletter-lightbox"\)/);
  assert.match(stylesheet, /\.newsletter-lightbox\.is-open/);
});

test("Newsletter main keeps the previous layout and title", async () => {
  const html = await read("newsletter.html");
  assert.match(html, /styles\/layout\.css\?v=20260929-85/);
  assert.match(html, /<span class="gnb__title">OALUM Newsletter<\/span>/);
});

test("Archive category navigation remains on the list and hides on details", async () => {
  const [html, controller, stylesheet] = await Promise.all([
    read("archive.html"),
    read("runtime/storefront/scripts/archive-20260816-06.js"),
    read("runtime/storefront/styles/archive-20260818-02.css"),
  ]);

  assert.match(html, /id="archiveTags"/);
  assert.match(controller, /if \(detailItem\)[\s\S]*tagsElement\.hidden = true/);
  assert.match(controller, /else \{[\s\S]*tagsElement\.hidden = false;[\s\S]*renderTags\(tagsElement\)/);
  assert.match(controller, /lastImage\.getBoundingClientRect\(\)\.bottom <= window\.innerHeight/);
  assert.doesNotMatch(controller, /bottom <= meta\.getBoundingClientRect\(\)\.top/);
  assert.match(controller, /class="archive-detail-spec"><span>사이즈<\/span>/);
  assert.match(controller, /class="archive-detail-spec"><span>재료<\/span>/);
  assert.match(controller, /class="archive-detail-spec archive-detail-tags"><span>태그<\/span>/);
  assert.doesNotMatch(controller, /<span>Tags<\/span>/);
  assert.ok(
    controller.indexOf('class="archive-detail-description"') < controller.indexOf('<span>사이즈</span>')
      && controller.indexOf('<span>사이즈</span>') < controller.indexOf('<span>재료</span>')
      && controller.indexOf('<span>재료</span>') < controller.indexOf('<span>태그</span>'),
    "archive detail should show description, size, material, then tags",
  );
  assert.match(stylesheet, /\.archive-detail-mode \.archive-tags[\s\S]*display:\s*none/);
  assert.match(stylesheet, /\.archive-detail-meta__more \.archive-detail-spec[\s\S]*grid-template-columns:\s*76px minmax\(0, 1fr\)/);
  assert.match(stylesheet, /\.archive-detail-meta__more \.archive-detail-spec[\s\S]*font-size:\s*16px/);
  assert.match(stylesheet, /\.archive-detail-meta__more \.archive-detail-spec > span[\s\S]*color:\s*rgba\(17,\s*17,\s*17,\s*0\.85\)/);
  assert.match(stylesheet, /\.archive-detail-meta__more \.archive-detail-description\s*\{[^}]*margin-bottom:\s*36px/);
  assert.match(stylesheet, /\.archive-detail-meta__more \.archive-detail-tag[\s\S]*text-decoration-line:\s*underline/);
});

test("My Oalum waits for the account response before revealing an auth view", async () => {
  const [html, controller, stylesheet] = await Promise.all([
    read("account.html"),
    read("runtime/storefront/scripts/account.js"),
    read("runtime/storefront/styles/account.css"),
  ]);

  assert.match(html, /document\.documentElement\.classList\.add\("account-session-pending"\)/);
  assert.match(stylesheet, /\.account-session-pending \.account-auth-shell/);
  assert.match(controller, /function showLoggedOut\(\)[\s\S]*classList\.remove\("account-session-pending"\)/);
  assert.match(controller, /function renderAuthenticated\(account\)[\s\S]*classList\.remove\("account-session-pending"\)/);

  const initialization = controller.slice(controller.lastIndexOf('window.addEventListener("studiooalum:auth-changed"'));
  assert.doesNotMatch(initialization, /\n\s*showLoggedOut\(\);\n\s*setActiveAuthPanel/);
  assert.match(initialization, /setActiveAuthPanel[\s\S]*loadAccount\(\{ silent: true \}\)/);
});

test("account entry uses compact line fields and the revised guest lookup copy", async () => {
  const [html, stylesheet] = await Promise.all([
    read("account.html"),
    read("runtime/storefront/styles/account.css"),
  ]);

  assert.match(html, /account\.css\?v=20261002-orders-01/);
  assert.match(html, /account\.js\?v=20261002-orders-01/);
  assert.match(html, /<h1 class="account-heading">로그인<\/h1>/);
  assert.match(html, /placeholder="이메일"/);
  assert.match(html, /placeholder="비밀번호"/);
  assert.match(html, />회원가입<\/a>[\s\S]*?>비밀번호 찾기<\/a>/);
  assert.match(html, /<h2 class="account-heading">비회원 내역 조회<\/h2>/);
  assert.match(html, /placeholder="조회번호"/);
  assert.match(html, /조회번호는 접수 완료 화면과 안내 이메일 문자에서 확인할 수 있습니다\./);
  assert.doesNotMatch(html, /비회원 신청 내역 조회|주문번호, 워크숍 예약번호 또는 수선 접수 조회번호/);
  assert.match(stylesheet, /\.account-auth-shell > \.account-panel \.account-heading\s*\{[^}]*font-family:\s*"Pretendard"[^}]*font-size:\s*16px;[^}]*font-weight:\s*600;/);
  assert.match(stylesheet, /\.account-auth-shell \.account-field input\s*\{[^}]*border:\s*0;[^}]*border-bottom:\s*1px solid #111;[^}]*font-size:\s*16px;/);
  assert.match(stylesheet, /\.account-auth-shell \.account-field input::placeholder\s*\{[^}]*color:\s*rgba\(17, 17, 17, 0\.3\);/);
  assert.match(stylesheet, /\.account-guest-lookup-help\s*\{[^}]*color:\s*rgba\(17,\s*17,\s*17,\s*0\.85\);[^}]*font-size:\s*16px;/);
});

test("login and guest errors use red field text and underlines without an error sentence", async () => {
  const [controller, stylesheet] = await Promise.all([
    read("runtime/storefront/scripts/account.js"),
    read("runtime/storefront/styles/account.css"),
  ]);

  assert.match(controller, /const setAuthFieldInvalid = \(form, fieldName, invalid = true\)/);
  assert.match(controller, /if \(!password\)\s*\{\s*setAuthFieldInvalid\(loginForm, "password"\);/);
  assert.match(controller, /setAuthFieldInvalid\(loginForm, "email"\);\s*setAuthFieldInvalid\(loginForm, "password"\);\s*setStatus\(loginStatusEl, ""\);/);
  assert.match(controller, /if \(!reference\)\s*\{\s*setAuthFieldInvalid\(guestForm, "reference"\);/);
  assert.match(controller, /setAuthFieldInvalid\(guestForm, "reference"\);\s*setAuthFieldInvalid\(guestForm, "email"\);\s*setStatus\(guestStatusEl, ""\);/);
  assert.doesNotMatch(controller, /setStatus\(loginStatusEl, "이메일 주소를 다시 확인해주세요\."/);
  assert.doesNotMatch(controller, /setStatus\(guestStatusEl, "이메일 주소를 다시 확인해주세요\."/);
  assert.match(stylesheet, /\.account-auth-shell \.account-field\.is-invalid input\s*\{[^}]*border-bottom-color:\s*var\(--color-error\);[^}]*color:\s*var\(--color-error\);/);
  assert.match(stylesheet, /\.account-auth-shell \.account-field\.is-invalid input::placeholder\s*\{[^}]*color:\s*var\(--color-error\);/);
  assert.match(stylesheet, /\.account-auth-shell \.account-status\.is-error\s*\{[^}]*visibility:\s*hidden;/);
});

test("signup follows the 16px line-form and checkbox rules", async () => {
  const [html, stylesheet] = await Promise.all([
    read("signup.html"),
    read("runtime/storefront/styles/account.css"),
  ]);

  assert.match(html, /account\.css\?v=20260929-85/);
  assert.match(html, /이메일과 비밀번호로 계정을 만들고 주문내역, 주소, 포인트를 관리할 수 있습니다\./);
  assert.match(html, /비밀번호는 8자 이상으로 입력해주세요\./);
  assert.doesNotMatch(html, /영문, 숫자, 기호를 함께 쓰면 더 안전합니다\./);
  for (const placeholder of ["이름", "이메일", "인증번호 6자리", "비밀번호", "비밀번호 확인"]) {
    assert.match(html, new RegExp(`placeholder="${placeholder}"`));
  }
  assert.match(stylesheet, /\.signup-page \.account-panel--signup \.account-copy\s*\{[^}]*color:\s*rgba\(17,\s*17,\s*17,\s*0\.85\);[^}]*font-size:\s*16px;/);
  assert.match(stylesheet, /\.signup-page \.account-panel--signup \.account-field input::placeholder\s*\{[^}]*color:\s*rgba\(17, 17, 17, 0\.3\);/);
  assert.match(stylesheet, /\.signup-page \.account-panel--signup \.account-checkbox\s*\{[^}]*font-size:\s*16px;/);
  assert.match(stylesheet, /\.signup-page \.account-panel--signup \.account-checkbox input\s*\{[^}]*appearance:\s*none;[^}]*border:\s*1px solid #111;/);
  assert.match(stylesheet, /\.signup-page \.account-panel--signup \.account-checkbox input:checked\s*\{[^}]*background-image:\s*url\("data:image\/svg\+xml/);
  assert.match(stylesheet, /\.signup-page \.account-panel--signup \.account-actions \.account-btn,[\s\S]*?width:\s*50%;[^}]*background:\s*#111;/);
  assert.match(html, /class="account-return-link">로그인으로 돌아가기<\/a>/);
  assert.match(stylesheet, /body:is\(\.signup-page, \.forgot-password-page\) \.account-panel \.account-panel-actions--auth > button\.account-btn\s*\{[^}]*width:\s*50% !important;[^}]*max-width:\s*50% !important;[^}]*min-width:\s*0 !important;/);
  assert.match(stylesheet, /body:is\(\.signup-page, \.forgot-password-page\) \.account-return-link\s*\{[^}]*justify-content:\s*flex-start;[^}]*width:\s*auto !important;[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*font-size:\s*16px;[^}]*font-weight:\s*400;[^}]*line-height:\s*1\.45;[^}]*text-decoration:\s*underline;[^}]*text-underline-offset:\s*3px;/);
});

test("password recovery follows the signup line-form and action rules", async () => {
  const html = await read("forgot-password.html");

  assert.match(html, /account\.css\?v=20260929-85/);
  for (const placeholder of ["이메일", "인증번호 6자리", "새 비밀번호", "새 비밀번호 확인"]) {
    assert.match(html, new RegExp(`placeholder="${placeholder}"`));
  }
  assert.match(html, /class="account-return-link">로그인으로 돌아가기<\/a>/);
  assert.match(html, />인증코드 받기<\/button>/);
  assert.match(html, />비밀번호 재설정<\/button>/);
});

test("My Oalum keeps logout in the account page and removes it from the GNB", async () => {
  const [html, stylesheet, siteChrome] = await Promise.all([
    read("account.html"),
    read("runtime/storefront/styles/account.css"),
    read("runtime/storefront/scripts/components/siteChrome-20260818-05.js"),
  ]);

  assert.match(html, />회원정보 수정<\/a>/);
  assert.doesNotMatch(html, /회원정보 수정\s*<span[^>]*>→<\/span>/);
  assert.match(html, /class="account-overview__link js-account-logout">로그아웃<\/button>/);
  assert.match(stylesheet, /\.account-overview__actions\s*\{[^}]*display:\s*grid;[^}]*justify-items:\s*start/);
  assert.match(stylesheet, /\.account-overview__link\s*\{[^}]*text-decoration:\s*underline/);
  assert.match(stylesheet, /\.account-overview__avatar > span\s*\{[^}]*place-items:\s*center/);
  assert.match(stylesheet, /\.account-dashboard-card\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(stylesheet, /\.account-dashboard-card--orders\s*\{[^}]*background:\s*#e34234/);
  assert.match(stylesheet, /\.account-dashboard-card--classes\s*\{[^}]*background:\s*#ffe74d/);
  assert.match(stylesheet, /\.account-dashboard-card--points\s*\{[^}]*background:\s*#c9d3d6/);
  assert.doesNotMatch(html, /account-overview__kicker|account-overview__title/);
  assert.match(html, /data-account-view-link="repairs"/);
  assert.match(html, /data-account-detail="repairs"/);
  assert.match(html, /js-account-avatar-input/);
  assert.match(html, /js-account-overview-address/);
  assert.match(html, /js-account-overview-phone/);
  assert.doesNotMatch(html, /js-account-overview-joined|>JOINED</);
  assert.doesNotMatch(html, /<dt>이름<\/dt>|<dt>이메일<\/dt>|<dt>주소<\/dt>|<dt>폰<\/dt>/);
  assert.match(stylesheet, /\.account-overview__welcome\s*\{[^}]*gap:\s*0;/);
  assert.match(stylesheet, /\.account-overview__facts > div\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*gap:\s*0;/);
  assert.match(html, />REPAIRS<[\s\S]*?>ORDERS<[\s\S]*?>CLASSES<[\s\S]*?>POINTS</);
  assert.match(stylesheet, /\.account-overview__welcome p:last-child\s*\{[^}]*color:\s*rgba\(17,\s*17,\s*17,\s*0\.85\)/);
  assert.match(stylesheet, /\.account-overview__facts\s*\{[^}]*border-top:\s*0/);
  assert.match(stylesheet, /\.account-overview__facts > div\s*\{[^}]*border-bottom:\s*1px solid #111/);
  assert.match(stylesheet, /\.account-overview__link\s*\{[^}]*font-size:\s*16px;[^}]*font-weight:\s*400;[^}]*text-decoration:\s*underline/);
  assert.match(stylesheet, /\.account-status\.is-success\s*\{[^}]*color:\s*rgba\(17,\s*17,\s*17,\s*0\.85\)/);
  assert.match(stylesheet, /@media \(max-width:\s*959px\)[\s\S]*?data-account-view="dashboard"[\s\S]*?\.account-overview\s*\{[\s\S]*?display:\s*none !important/);
  assert.match(siteChrome, /document\.querySelectorAll\("\.gnb \[data-auth-toggle='logout'\]"\)/);
});

test("completed order history hides cancelled orders and uses the revised card layout", async () => {
  const [html, controller, stylesheet] = await Promise.all([
    read("account.html"),
    read("runtime/storefront/scripts/account.js"),
    read("runtime/storefront/styles/account.css"),
  ]);

  assert.match(html, /<h2 class="account-heading">주문 내역<\/h2>/);
  assert.match(controller, /function isCompletedAccountOrder\(order\)/);
  assert.match(controller, /const completedOrders = orders\.filter\(isCompletedAccountOrder\)/);
  assert.match(controller, /renderOrders\(completedOrders\)/);
  assert.match(controller, /account-record account-record--order/);
  assert.match(stylesheet, /\.account-panel--orders \.account-record--order\s*\{[^}]*grid-template-columns:\s*160px minmax\(0, 1fr\);/);
  assert.match(stylesheet, /\.account-panel--orders \.account-record--order \.account-record__thumb,[\s\S]*?border:\s*0;/);
  assert.match(stylesheet, /\.account-panel--orders \.account-record--order \.account-record__title\s*\{[^}]*font-size:\s*16px;/);
  assert.match(stylesheet, /\.account-panel--orders \.account-record--order \.account-order-total\s*\{[^}]*font-weight:\s*600;/);
});
