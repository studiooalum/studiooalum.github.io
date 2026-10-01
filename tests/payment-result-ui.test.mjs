import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("completed order actions use a half-width status button and underlined Shop link", async () => {
  const stylesheet = await readFile(new URL("runtime/storefront/styles/payment.css", root), "utf8");

  assert.match(stylesheet, /\.confirm-success \.payment-result__actions\s*\{[^}]*align-items:\s*flex-start/);
  assert.match(stylesheet, /\.confirm-success \.payment-btn--secondary\s*\{[^}]*width:\s*50%/);
  assert.match(stylesheet, /\.confirm-success \.payment-btn--outline\s*\{[^}]*width:\s*auto;[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*font-size:\s*16px;[^}]*text-align:\s*left;[^}]*text-decoration:\s*underline/);
  assert.match(stylesheet, /\.confirm-success \.payment-btn--outline:is\(:hover, :focus-visible, :active\)\s*\{[^}]*background:\s*transparent/);
});
