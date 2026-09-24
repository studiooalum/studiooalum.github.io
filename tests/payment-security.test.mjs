import assert from "node:assert/strict";
import test from "node:test";
import { confirmTossPayment, cancelTossPayment, getTossConfig } from "../cloudflare/lib/toss.js";
import { resolveOrderItems } from "../cloudflare/lib/commerce.js";
import { assertSameOrigin } from "../cloudflare/lib/request-security.js";
import { readJson, json, errorResponse } from "../cloudflare/lib/http.js";

const env = { TOSS_CLIENT_KEY: "test_gck_fixture", TOSS_SECRET_KEY: "test_gsk_fixture" };
test("API responses are private and cross-origin mutations are rejected", async () => {
  assert.match(json({}, { ok: true }).headers.get("Cache-Control"), /no-store/);
  assert.throws(() => assertSameOrigin(new Request("https://studiooalum.com/api/orders", { method: "POST", headers: { Origin: "https://attacker.example" } })), { status: 403 });
  const result = await errorResponse({}, Object.assign(new Error("SQL secret detail"), { details: { token: "secret" } })).json();
  assert.doesNotMatch(JSON.stringify(result), /SQL|secret|token/);
  await assert.rejects(readJson(new Request("https://example.test", { method: "POST", body: "{}" })), { status: 415 });
  await assert.rejects(readJson(new Request("https://example.test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "x".repeat(1024 * 1024) }) })), { status: 413 });
});
const input = { paymentKey: "payment-key", orderId: "ORDER_FIXTURE", amount: 50000 };
const approved = { paymentKey: input.paymentKey, orderId: input.orderId, totalAmount: input.amount, currency: "KRW", status: "DONE", approvedAt: "2026-09-24T10:00:00+09:00" };

function mockFetch(context, implementation) {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  context.after(() => { globalThis.fetch = original; });
}

test("order prices and titles are resolved from published products, never the browser", async (context) => {
  mockFetch(context, async () => Response.json({ result: [{ _id: "product-1", title: "Published product", price: 50000, discountRate: 10 }] }));
  const items = await resolveOrderItems({}, [{ _id: "product-1", lineId: "product-1", title: "Forged", price: 1, qty: 2 }]);
  assert.equal(items[0].price, 45000);
  assert.equal(items[0].title, "Published product");
  await assert.rejects(resolveOrderItems({}, [{ lineId: "missing", title: "Forged", price: 1, qty: 1 }]), { status: 409 });
  await assert.rejects(resolveOrderItems({}, [{ lineId: "product-1", title: "Forged", price: 1, qty: -1 }]), { status: 400 });
});

test("Toss keys must use the same mode and checkout needs a server key", () => {
  assert.equal(getTossConfig(env).isClientReady, true);
  assert.equal(getTossConfig({ TOSS_CLIENT_KEY: "live_gck_fixture", TOSS_SECRET_KEY: env.TOSS_SECRET_KEY }).isClientReady, false);
  assert.equal(getTossConfig({ TOSS_CLIENT_KEY: env.TOSS_CLIENT_KEY }).isClientReady, false);
});

test("Toss confirmation validates exact provider data and sends a stable idempotency key", async (context) => {
  mockFetch(context, async (url, init) => {
    assert.equal(init.headers["Idempotency-Key"], `confirm-${input.orderId}`);
    return Response.json(approved);
  });
  const result = await confirmTossPayment(env, input);
  assert.equal(result.amount, input.amount);
  assert.equal(result.providerMode, "test-confirmation");
});

test("missing, mismatched and non-final provider responses never become paid", async (context) => {
  for (const payload of [{}, { ...approved, totalAmount: 1 }, { ...approved, currency: "USD" }, { ...approved, status: "WAITING_FOR_DEPOSIT" }, { ...approved, paymentKey: "other" }]) {
    mockFetch(context, async () => Response.json(payload));
    await assert.rejects(confirmTossPayment(env, input), { status: 502 });
  }
  await assert.rejects(confirmTossPayment(env, { ...input, amount: 1.1 }), { status: 400 });
});

test("ambiguous or duplicate confirmation is reconciled against Toss", async (context) => {
  const requests = [];
  mockFetch(context, async (url, init) => {
    requests.push(init.method);
    return init.method === "POST" ? Response.json({ code: "ALREADY_PROCESSED_PAYMENT" }, { status: 400 }) : Response.json(approved);
  });
  assert.equal((await confirmTossPayment(env, input)).status, "DONE");
  assert.deepEqual(requests, ["POST", "GET"]);
});

test("full refunds require canceled status and zero remaining balance", async (context) => {
  mockFetch(context, async (url, init) => {
    assert.equal(init.headers["Idempotency-Key"], `cancel-${input.orderId}-${input.amount}`);
    return Response.json({ ...approved, status: "CANCELED", balanceAmount: 0, cancels: [{ canceledAt: approved.approvedAt, cancelAmount: input.amount }] });
  });
  assert.equal((await cancelTossPayment(env, input)).status, "CANCELED");
});