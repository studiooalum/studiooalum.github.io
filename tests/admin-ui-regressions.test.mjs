import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

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
  assert.match(editorSource, /Pretendard · 사이트 기본/);
  assert.match(editorSource, /Wanted Sans · 제목[\s\S]*Gotham Book · 영문/);
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

  assert.match(html, /newsletter-20260818-03\.css\?v=20260926-01/);
  assert.match(html, /newsletter-20260818-02\.js\?v=20260915-01/);
  assert.match(layoutStylesheet, /\.newsletter-entry-mode \.newsletter-entry > \*[\s\S]*grid-column:\s*2/);
  assert.match(stylesheet, /figure\[data-image-gallery="true"\][\s\S]*grid-template-columns:\s*repeat\(2/);
  assert.match(controller, /function enhanceEntryImages/);
  assert.match(controller, /data-newsletter-lightbox-close/);
  assert.match(controller, /lockBodyScroll\("newsletter-lightbox"\)/);
  assert.match(stylesheet, /\.newsletter-lightbox\.is-open/);
});

test("Newsletter main keeps the previous layout and title", async () => {
  const html = await read("newsletter.html");
  assert.match(html, /styles\/layout\.css\?v=20260520-02/);
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
  assert.match(stylesheet, /\.archive-detail-meta__more \.archive-detail-spec > span[\s\S]*color:\s*#111/);
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

  assert.match(html, /account\.css\?v=20260926-04/);
  assert.match(html, /account\.js\?v=20260926-02/);
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
  assert.match(stylesheet, /\.account-guest-lookup-help\s*\{[^}]*color:\s*#111;[^}]*font-size:\s*16px;/);
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
  assert.match(stylesheet, /\.account-auth-shell \.account-field\.is-invalid input\s*\{[^}]*border-bottom-color:\s*#c92a2a;[^}]*color:\s*#c92a2a;/);
  assert.match(stylesheet, /\.account-auth-shell \.account-field\.is-invalid input::placeholder\s*\{[^}]*color:\s*#c92a2a;/);
  assert.match(stylesheet, /\.account-auth-shell \.account-status\.is-error\s*\{[^}]*visibility:\s*hidden;/);
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
  assert.match(stylesheet, /@media \(max-width:\s*959px\)[\s\S]*?data-account-view="dashboard"[\s\S]*?\.account-overview\s*\{[\s\S]*?display:\s*none !important/);
  assert.match(siteChrome, /document\.querySelectorAll\("\.gnb \[data-auth-toggle='logout'\]"\)/);
});
