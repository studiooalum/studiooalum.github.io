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

test("newsletter headings support H1–H6 with safe text alignment", () => {
  const source = [
    '<h1 data-text-align="left">Heading 1</h1>',
    '<h2 style="text-align: center" onclick="alert(1)">Heading 2</h2>',
    '<h3 data-text-align="right">Heading 3</h3>',
    '<h4 style="text-align: justify">Heading 4</h4>',
    '<h5 data-text-align="unsafe">Heading 5</h5>',
    '<h6 class="hidden">Heading 6</h6>',
  ].join("");

  assert.equal(
    sanitizeNewsletterHtml(source),
    '<h1 data-text-align="left">Heading 1</h1><h2 data-text-align="center">Heading 2</h2><h3 data-text-align="right">Heading 3</h3><h4 data-text-align="justify">Heading 4</h4><h5>Heading 5</h5><h6>Heading 6</h6>',
  );
});

test("newsletter image galleries keep safe layout and direct image attributes", () => {
  const source = [
    '<figure data-image-gallery="true" data-image-count="2" class="unsafe" onclick="alert(1)">',
    '<img src="https://example.com/one.jpg" alt="첫 이미지" title="첫 이미지 제목" width="640" height="480" data-progressive-image="false" style="width:9999px" onerror="alert(1)">',
    '<img src="/images/two.jpg" alt="두 번째 이미지" width="1200" height="800" data-unsafe="true">',
    "</figure>",
  ].join("");

  const sanitized = sanitizeNewsletterHtml(source);

  assert.equal(
    sanitized,
    '<figure data-image-gallery="true" data-image-count="2"><img src="https://example.com/one.jpg" alt="첫 이미지" title="첫 이미지 제목" width="640" height="480" data-progressive-image="false"><img src="/images/two.jpg" alt="두 번째 이미지" width="1200" height="800"></figure>',
  );
  assert.doesNotMatch(sanitized, /onclick|onerror|class=|style=|data-unsafe/);
});

test("newsletter image gallery count accepts 2–12 only", () => {
  const twelveImages = Array.from(
    { length: 12 },
    (_, index) => `<img src="/images/${index + 1}.jpg" alt="${index + 1}">`,
  ).join("");
  const valid = sanitizeNewsletterHtml(
    `<figure data-image-gallery="true" data-image-count="12">${twelveImages}</figure>`,
  );
  const invalid = sanitizeNewsletterHtml([
    '<figure data-image-gallery="true" data-image-count="13"><img src="/images/a.jpg" alt="a"></figure>',
    '<figure data-image-gallery="true" data-image-count="2.5"><img src="/images/b.jpg" alt="b"></figure>',
    '<figure data-image-gallery="false" data-image-count="2"><img src="/images/c.jpg" alt="c"></figure>',
    '<figure data-image-count="2"><img src="/images/d.jpg" alt="d"></figure>',
  ].join(""));

  assert.match(valid, /^<figure data-image-gallery="true" data-image-count="12">/);
  assert.doesNotMatch(invalid, /data-image-gallery|data-image-count/);
  assert.match(invalid, /<figure><img src="\/images\/a\.jpg" alt="a"><\/figure>/);
});
