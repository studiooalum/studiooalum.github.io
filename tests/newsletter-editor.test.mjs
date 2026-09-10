import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeNewsletterHtml } from "../cloudflare/lib/newsletters.js";

test("newsletter sanitizer preserves supported Tiptap font styles", () => {
  const html = sanitizeNewsletterHtml(`
    <p><span style="font-family: Pretendard; font-size: 18px">한글</span></p>
    <p><span style="font-family: 'Times New Roman'">English</span></p>
    <p><span style="font-family: 'Wanted Sans'; font-size: 1pt">최소</span></p>
    <p><span style="font-size: 40pt">최대</span></p>
  `);

  assert.match(html, /data-font-family="Pretendard"/);
  assert.match(html, /font-family: Pretendard/);
  assert.match(html, /data-font-size="18"/);
  assert.match(html, /data-font-family="Times New Roman"/);
  assert.match(html, /font-family: &quot;Wanted Sans&quot;/);
  assert.match(html, /font-size: 1pt/);
  assert.match(html, /font-size: 40pt/);
});

test("newsletter sanitizer preserves safe line height and colors", () => {
  const html = sanitizeNewsletterHtml(
    '<p data-text-align="justify"><span style="line-height: 0; color: #123abc; background-color: #fff2a8">좁게</span><span style="line-height: 2.1">넓게</span></p>',
  );

  assert.match(html, /data-text-align="justify"/);
  assert.match(html, /data-line-height="0"/);
  assert.match(html, /line-height: 0/);
  assert.match(html, /data-line-height="2.1"/);
  assert.match(html, /line-height: 2.1/);
  assert.match(html, /color: #123abc/);
  assert.match(html, /background-color: #fff2a8/);
});

test("newsletter sanitizer rejects unsafe line height and colors", () => {
  const html = sanitizeNewsletterHtml(
    '<p><span style="line-height: 10.1; color: expression(alert(1)); background-color: url(javascript:alert(1))">text</span></p>',
  );

  assert.equal(html, "<p><span>text</span></p>");
});

test("newsletter sanitizer enforces the 1–40pt editor range", () => {
  const html = sanitizeNewsletterHtml(
    '<p><span style="font-size: 0pt">too small</span><span style="font-size: 41pt">too large</span></p>',
  );

  assert.equal(html, "<p><span>too small</span><span>too large</span></p>");
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
    <img src="https://example.com/resized.jpg" alt="크기 조정 이미지" title="작업 이미지" width="640" height="480" data-image-align="center">
  `);

  assert.match(html, /<p data-text-align="center">가운데<\/p>/);
  assert.match(html, /data-image-align="right"/);
  assert.match(html, /data-image-size="medium"/);
  assert.match(html, /<img src="https:\/\/example\.com\/image\.jpg" alt="작업 이미지">/);
  assert.match(html, /<img src="https:\/\/example\.com\/resized\.jpg" alt="크기 조정 이미지" title="작업 이미지" width="640" height="480" data-image-align="center">/);
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
