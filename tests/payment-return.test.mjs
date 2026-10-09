import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { paymentConfirmSchema } from "../cloudflare/lib/commerce.js";

const source = readFileSync(new URL("../runtime/storefront/scripts/success.js", import.meta.url), "utf8").replace(/^import .*;$/m, "");

async function runReturnPage({ query = "?paymentKey=fixture-key&orderId=ORDER_BROWSER&amount=42000", fail = false } = {}) {
  const elements = new Map();
  const calls = [];
  const removed = [];
  const context = {
    URLSearchParams, CART_KEY: "cart", ORDER_KEY: "order", console: { error() {} },
    window: { location: { search: query } },
    document: { getElementById(id) {
      if (!elements.has(id)) elements.set(id, { style: {}, textContent: "", disabled: false, addEventListener() {} });
      return elements.get(id);
    } },
    localStorage: { removeItem(key) { removed.push(key); } },
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(paymentConfirmSchema.safeParse(body).success, true, "return page must submit the actual server contract");
      calls.push({ url, body });
      if (fail) throw new TypeError("network failure");
      return Response.json({ ok: true, payment: { orderId: body.orderId, amount: body.amount, status: "DONE" } });
    },
  };
  vm.runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return { elements, calls, removed };
}

test("Shop payment return automatically confirms with a numeric amount and only then clears the cart", async () => {
  const result = await runReturnPage();
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].body.amount, 42000);
  assert.equal(result.elements.get("confirmSuccess").style.display, "flex");
  assert.deepEqual(result.removed, ["cart", "order"]);
});

test("failed confirmation never displays a preview success or clears the cart", async () => {
  const result = await runReturnPage({ fail: true });
  assert.equal(result.elements.get("confirmError").style.display, "flex");
  assert.equal(result.elements.get("confirmSuccess").style.display, "none");
  assert.deepEqual(result.removed, []);
});

test("invalid return amounts are rejected without an API request", async () => {
  for (const amount of ["NaN", "-1", "1.5", "0"]) {
    const result = await runReturnPage({ query: `?paymentKey=key&orderId=ORDER_BROWSER&amount=${amount}` });
    assert.equal(result.calls.length, 0);
    assert.equal(result.elements.get("confirmError").style.display, "flex");
  }
});

test("API individual keys open the card window with the same persisted order and amount", async () => {
  const { createTossCheckout } = await import("../runtime/storefront/scripts/utils/toss-checkout.js");
  let requested;
  const sdk = () => ({ payment: () => ({ requestPayment: async options => { requested = options; } }), widgets: () => { throw new Error("wrong SDK product"); } });
  sdk.ANONYMOUS = "ANONYMOUS";
  const client = await createTossCheckout({ clientKey: "live_ck_fixture", amount: 42000, methodsSelector: "#methods", agreementSelector: "#agreement" }, { sdk, document: { querySelector: () => ({ textContent: "" }) } });
  await client.requestPayment({ orderId: "ORDER_BROWSER", successUrl: "https://studiooalum.test/success", failUrl: "https://studiooalum.test/fail" });
  assert.equal(requested.method, "CARD");
  assert.deepEqual(requested.amount, { currency: "KRW", value: 42000 });
  assert.equal(requested.orderId, "ORDER_BROWSER");
});

test("widget keys honor live variants and prevent unsupported virtual-account issuance", async () => {
  const { createTossCheckout } = await import("../runtime/storefront/scripts/utils/toss-checkout.js");
  const variants = [];
  let selected = { code: "VIRTUAL_ACCOUNT" };
  let requests = 0;
  const sdk = () => ({ widgets: () => ({ setAmount: async () => {}, renderPaymentMethods: async options => { variants.push(options.variantKey); return { getSelectedPaymentMethod: () => selected }; }, renderAgreement: async options => { variants.push(options.variantKey); }, requestPayment: async () => { requests++; } }) });
  sdk.ANONYMOUS = "ANONYMOUS";
  const client = await createTossCheckout({ clientKey: "live_gck_fixture", amount: 42000, paymentVariantKey: "LIVE", agreementVariantKey: "TERMS" }, { sdk });
  assert.deepEqual(variants, ["LIVE", "TERMS"]);
  await assert.rejects(client.requestPayment({ orderId: "ORDER_BROWSER" }), /가상계좌/);
  assert.equal(requests, 0);
  selected = { code: "CARD" };
  await client.requestPayment({ orderId: "ORDER_BROWSER" });
  assert.equal(requests, 1);
});
