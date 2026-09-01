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

test("newsletter sanitizer preserves standard Tiptap text formatting", () => {
  const sanitized = sanitizeNewsletterHtml('<p><strong>굵게</strong> <em>기울임</em> <u>밑줄</u> <s>취소선</s></p><ul><li>목록</li></ul><blockquote><p>인용</p></blockquote>');

  assert.match(sanitized, /<strong>굵게<\/strong>/);
  assert.match(sanitized, /<em>기울임<\/em>/);
  assert.match(sanitized, /<u>밑줄<\/u>/);
  assert.match(sanitized, /<s>취소선<\/s>/);
  assert.match(sanitized, /<ul><li>목록<\/li><\/ul>/);
  assert.match(sanitized, /<blockquote><p>인용<\/p><\/blockquote>/);
});
