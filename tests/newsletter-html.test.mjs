import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeNewsletterHtml } from "../cloudflare/lib/newsletters.js";

test("Tiptap newsletter HTML keeps supported structure and safe attributes", () => {
  const source = [
    '<p style="color:red">문단 <strong>굵게</strong> <em>기울임</em></p>',
    "<h2>제목</h2><h3>소제목</h3>",
    "<ul><li>글머리</li></ul><ol><li>번호</li></ol>",
    "<blockquote>인용문</blockquote>",
    '<p><a href="https://example.com/path" style="font-size:40px">링크</a></p>',
    '<img src="https://example.com/image.jpg" alt="이미지" style="width:9999px">',
    "<hr>",
  ].join("");

  const sanitized = sanitizeNewsletterHtml(source);

  assert.match(sanitized, /<p>문단 <strong>굵게<\/strong> <em>기울임<\/em><\/p>/);
  assert.match(sanitized, /<h2>제목<\/h2><h3>소제목<\/h3>/);
  assert.match(sanitized, /<ul><li>글머리<\/li><\/ul><ol><li>번호<\/li><\/ol>/);
  assert.match(sanitized, /<blockquote>인용문<\/blockquote>/);
  assert.match(sanitized, /<a href="https:\/\/example\.com\/path" target="_blank" rel="noopener noreferrer">링크<\/a>/);
  assert.match(sanitized, /<img src="https:\/\/example\.com\/image\.jpg" alt="이미지">/);
  assert.match(sanitized, /<hr>/);
  assert.doesNotMatch(sanitized, /style=/);
});

test("legacy newsletter figures and captions remain compatible", () => {
  const source = '<figure data-image-align="center" data-image-size="full" data-image-position="inline" data-image-layout="single"><img src="/api/r2/newsletters/image.jpg" alt="기존 이미지"><figcaption>기존 캡션</figcaption></figure>';

  assert.equal(sanitizeNewsletterHtml(source), source);
});