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
  assert.match(editorSource, /FONT_SIZE_MIN = 1/);
  assert.match(editorSource, /FONT_SIZE_MAX = 40/);
  assert.match(editorSource, /LINE_HEIGHT_MIN = 0/);
  assert.match(editorSource, /step="0\.1"/);
  assert.match(editorSource, /Pretendard · 본문[\s\S]*Wanted Sans · 제목[\s\S]*Gotham Book · 영문/);
  assert.match(editorSource, /resize:\s*\{[\s\S]*enabled:\s*true/);
  assert.match(editorSource, /setImage\(\{ src: imageUrl/);
  assert.match(stylesheet, /\.newsletter-admin-toolbar\s*\{[\s\S]*position:\s*sticky;[\s\S]*top:\s*calc\(var\(--gnb-height, 40px\) - 1px\);/);
  await assert.rejects(access(new URL("runtime/storefront/scripts/newsletter-admin.bundle.js", root)));
  await assert.rejects(access(new URL("runtime/storefront/scripts/newsletter-tiptap-editor-20260910-01.js", root)));
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
  assert.match(stylesheet, /\.archive-detail-mode \.archive-tags[\s\S]*display:\s*none/);
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
