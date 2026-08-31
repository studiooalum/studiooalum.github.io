import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeNewsletterHtml } from "../cloudflare/lib/newsletters.js";

test("newsletter sanitizer preserves supported Tiptap font styles", () => {
  const html = sanitizeNewsletterHtml(`
    <p><span style="font-family: Pretendard; font-size: 18px">한글</span></p>
    <p><span style="font-family: 'Times New Roman'">English</span></p>
  `);

  assert.match(html, /data-font-family="Pretendard"/);
  assert.match(html, /font-family: Pretendard/);
  assert.match(html, /data-font-size="18"/);
  assert.match(html, /data-font-family="Times New Roman"/);
});

test("newsletter sanitizer removes unsupported font and unsafe styles", () => {
  const html = sanitizeNewsletterHtml(
    `<p><span style="font-family: NotInstalled; color: red; background: url(javascript:alert(1))">text</span></p>`,
  );

  assert.equal(html, "<p><span>text</span></p>");
});

test("newsletter sanitizer preserves legacy image layout and Tiptap alignment", () => {
  const html = sanitizeNewsletterHtml(`
    <p data-text-align="center">가운데</p>
    <figure data-image-align="right" data-image-size="medium" data-image-position="inline" data-image-layout="single">
      <img src="https://example.com/image.jpg" alt="작업 이미지">
    </figure>
  `);

  assert.match(html, /<p data-text-align="center">가운데<\/p>/);
  assert.match(html, /data-image-align="right"/);
  assert.match(html, /data-image-size="medium"/);
  assert.match(html, /<img src="https:\/\/example\.com\/image\.jpg" alt="작업 이미지">/);
});
