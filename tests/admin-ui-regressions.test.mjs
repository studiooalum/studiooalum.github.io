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

  assert.match(html, /newsletter-20260818-03\.css\?v=20260915-02/);
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
  assert.match(controller, /class="archive-detail-spec"><span>소재<\/span>/);
  assert.match(controller, /class="archive-detail-spec"><span>사이즈<\/span>/);
  assert.match(controller, /class="archive-detail-tags">/);
  assert.doesNotMatch(controller, /<span>Tags<\/span>/);
  assert.ok(
    controller.indexOf('class="archive-detail-description"') < controller.indexOf('class="archive-detail-tags"'),
    "archive description should appear before its tag link",
  );
  assert.match(stylesheet, /\.archive-detail-mode \.archive-tags[\s\S]*display:\s*none/);
  assert.match(stylesheet, /\.archive-detail-meta__more \.archive-detail-spec[\s\S]*grid-template-columns:\s*76px minmax\(0, 1fr\)/);
  assert.match(stylesheet, /\.archive-detail-meta__more \.archive-detail-spec[\s\S]*font-size:\s*16px/);
  assert.match(stylesheet, /\.archive-detail-meta__more \.archive-detail-spec > span[\s\S]*color:\s*#111/);
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
