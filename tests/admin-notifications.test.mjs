import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { persistOrder, readFulfillmentOrders } from "../cloudflare/lib/d1.js";
import {
  enqueueOrderCompletedAdminNotification,
  enqueueWorkshopReservationAdminNotification,
} from "../cloudflare/lib/notifications.js";
import {
  readWorkshopAvailability,
  maintainWorkshopOperations,
  createWorkshopCheckout,
  confirmWorkshopPayment,
  upsertWorkshopContent,
} from "../cloudflare/lib/workshops.js";
import { onRequestPost as confirmPayment } from "../functions/api/payments/confirm.js";
import { onRequestPost as createWorkshopReservation } from "../functions/api/workshops/reservations.js";
import { onRequestPost as tossWebhook } from "../functions/api/webhooks/toss.js";

class D1BoundStatement {
  constructor(statement, values) {
    this.statement = statement;
    this.values = values;
  }

  first() { return this.statement.get(...this.values) || null; }
  all() { return { results: this.statement.all(...this.values) }; }
  run() {
    const result = this.statement.run(...this.values);
    return { meta: { changes: Number(result.changes || 0) } };
  }
}

class D1Statement {
  constructor(database, sql) { this.statement = database.prepare(sql); }
  bind(...values) { return new D1BoundStatement(this.statement, values); }
  first() { return new D1BoundStatement(this.statement, []).first(); }
  all() { return new D1BoundStatement(this.statement, []).all(); }
  run() { return new D1BoundStatement(this.statement, []).run(); }
}

class D1Database {
  constructor() {
    this.database = new DatabaseSync(":memory:");
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec(readFileSync(new URL("../cloudflare/d1/schema.sql", import.meta.url), "utf8"));
    this.database.exec(readFileSync(new URL("../cloudflare/d1/migrations/0037_operational_notifications.sql", import.meta.url), "utf8"));
    this.database.exec(readFileSync(new URL("../cloudflare/d1/migrations/0035_workshop_operations.sql", import.meta.url), "utf8"));
    this.database.exec(readFileSync(new URL("../cloudflare/d1/migrations/0038_payment_reservation_guards.sql", import.meta.url), "utf8"));
    this.database.exec(readFileSync(new URL("../cloudflare/d1/migrations/0042_payment_review_notification.sql", import.meta.url), "utf8"));
  }

  prepare(sql) { return new D1Statement(this.database, sql); }
  batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
  close() { this.database.close(); }
}

function createEnvironment(overrides = {}) {
  const database = new D1Database();
  return {
    database,
    env: {
      OALUM_DB: database,
      PUBLIC_SITE_URL: "https://studiooalum.test",
      REPAIR_ADMIN_EMAIL: "admin@example.com",
      AUTH_SECRET: "test-auth-secret",
      ...overrides,
    },
  };
}

function createContext(env, path, body) {
  const pending = [];
  return {
    context: {
      env,
      request: new Request(`https://studiooalum.test${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      waitUntil(promise) { pending.push(promise); },
    },
    flush: () => Promise.all(pending),
  };
}

function createOrder(orderId) {
  return {
    orderId,
    orderName: "테스트 주문",
    status: "created",
    paymentStatus: "pending",
    subtotalAmount: 42000,
    total: 42000,
    items: [{ lineId: "line-1", productId: "product-1", title: "테스트 상품", price: 42000, qty: 1 }],
    shipping: {
      name: "홍길동",
      phone: "010-1234-5678",
      email: "customer@example.com",
      zipcode: "02400",
      address1: "서울시 테스트로 1",
      address2: "",
    },
  };
}

function readAdminOutbox(database, templateKey) {
  return database.prepare(`
    SELECT event_key, recipient, payload_json
    FROM notification_outbox
    WHERE template_key = ?
    ORDER BY created_at
  `).bind(templateKey).all().results;
}

test("administrator notification helpers resolve recipients and remain idempotent", async (t) => {
  const { database, env } = createEnvironment({ NOTIFICATION_TEST_EMAIL: "preview@example.com" });
  t.after(() => database.close());

  const order = {
    orderId: "ORD-HELPER",
    totalAmount: 42000,
    customer: { name: "홍길동", email: "customer@example.com", phone: "010-1234-5678" },
  };
  await enqueueOrderCompletedAdminNotification(env, order);
  await enqueueOrderCompletedAdminNotification(env, order);
  await enqueueWorkshopReservationAdminNotification(env, {
    reservationId: "WSR-HELPER",
    reservationNumber: "WKS-WSR-HELPER",
    workshopTitle: "Visible Mending",
    fullName: "김오알",
    email: "workshop@example.com",
    phone: "010-8765-4321",
    slotLabel: "2026-10-01 14:00",
    amountDue: 70000,
  });

  const orderRows = readAdminOutbox(database, "shop.order_completed_admin");
  const workshopRows = readAdminOutbox(database, "workshop.reservation_submitted_admin");
  assert.equal(orderRows.length, 1);
  assert.equal(orderRows[0].recipient, "preview@example.com");
  assert.equal(JSON.parse(orderRows[0].payload_json).final_amount, "42,000원");
  assert.equal(workshopRows.length, 1);
  assert.equal(workshopRows[0].recipient, "preview@example.com");
  assert.match(workshopRows[0].event_key, /WSR-HELPER/);
});

test("payment confirmation queues the paid-order administrator alert", async (t) => {
  const { database, env } = createEnvironment({ TOSS_CLIENT_KEY: "test_gck_fixture", TOSS_SECRET_KEY: "test_gsk_fixture" });
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async url => String(url).includes('.sanity.io/') ? Response.json({result:[{_id:'product-1',soldOut:false}]}) : Response.json({ paymentKey: "fixture-payment", orderId: "ORD-PAID-ADMIN", totalAmount: 42000, currency: "KRW", status: "DONE", approvedAt: new Date().toISOString() });
  t.after(() => database.close());
  await persistOrder(env, createOrder("ORD-PAID-ADMIN"));

  const { context, flush } = createContext(env, "/api/payments/confirm", {
    orderId: "ORD-PAID-ADMIN",
    orderName: "테스트 주문",
    amount: 42000,
    paymentKey: "fixture-payment",
  });
  const response = await confirmPayment(context);
  assert.equal(response.status, 200);
  await flush();

  const [notification] = readAdminOutbox(database, "shop.order_completed_admin");
  assert.equal(notification.recipient, "admin@example.com");
  assert.equal(JSON.parse(notification.payload_json).order_number, "ORD-PAID-ADMIN");
  assert.equal(readAdminOutbox(database, "shop.order_completed").length, 1);
});

test("competing payment keys cannot approve the same shop order twice", async (context) => {
  const { database, env } = createEnvironment({ TOSS_CLIENT_KEY: "test_gck_fixture", TOSS_SECRET_KEY: "test_gsk_fixture" });
  context.after(() => database.close());
  await persistOrder(env, createOrder("ORDER_CONCURRENT"));
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    if(String(url).includes('.sanity.io/')) return Response.json({result:[{_id:'product-1',soldOut:false}]});
    calls += 1;
    const body = JSON.parse(options.body);
    return Response.json({ ...body, totalAmount: 42000, currency: "KRW", status: "DONE", approvedAt: new Date().toISOString() });
  };
  const first = createContext(env, "/api/payments/confirm", { orderId: "ORDER_CONCURRENT", paymentKey: "first-key", amount: 42000 });
  const second = createContext(env, "/api/payments/confirm", { orderId: "ORDER_CONCURRENT", paymentKey: "second-key", amount: 42000 });
  const responses = await Promise.all([confirmPayment(first.context), confirmPayment(second.context)]);
  await Promise.all([first.flush(), second.flush()]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal(calls, 1);
});

test("workshop reservation and payment queue both audiences without duplicate alerts", async (t) => {
  const { database, env } = createEnvironment({ TOSS_CLIENT_KEY: "test_gck_fixture", TOSS_SECRET_KEY: "test_gsk_fixture" });
  t.after(() => database.close());
  await upsertWorkshopContent(env, {
    slug: "admin-alert-workshop",
    title: "관리자 알림 워크숍",
    status: "published",
    price: 50000,
    scheduleSlots: [{
      _key: "admin-alert-slot",
      label: "2099-10-01 14:00",
      date: "2099-10-01",
      startTime: "14:00",
      endTime: "17:00",
      capacity: 4,
      isBlocked: false,
    }],
    galleryImages: [],
    bookingConfig: {
      workshopType: "event",
      fixedPrice: 50000,
      minParticipants: 1,
      maxParticipants: 4,
      paymentDeadlineHours: 48,
    },
  });
  const workshop = await readWorkshopAvailability(env, "admin-alert-workshop");
  const slot = workshop.scheduleSlots.find((item) => item.status !== "blocked");
  assert.ok(slot);

  const { context, flush } = createContext(env, "/api/workshops/reservations", {
    slug: "admin-alert-workshop",
    slotKey: slot.key,
    fullName: "김오알",
    email: "workshop@example.com",
    phone: "010-8765-4321",
    attendeeCount: 1,
  });
  const response = await createWorkshopReservation(context);
  assert.equal(response.status, 201);
  const payload = await response.json();
  await flush();

  const [notification] = readAdminOutbox(database, "workshop.reservation_submitted_admin");
  assert.equal(notification.recipient, "admin@example.com");
  assert.equal(JSON.parse(notification.payload_json).reservation_number, payload.reservation.reservationNumber);
  assert.equal(readAdminOutbox(database, "workshop.reservation_received").length, 1);
  const checkout = await createWorkshopCheckout(env, { checkoutId: payload.checkoutId });
  assert.equal((await createWorkshopCheckout(env, { checkoutId: payload.checkoutId })).order.orderId, checkout.order.orderId);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({ paymentKey: "workshop-payment", orderId: checkout.order.orderId, totalAmount: 50000, currency: "KRW", status: "DONE", approvedAt: new Date().toISOString() });
  const confirmation = { checkoutId: payload.checkoutId, paymentKey: "workshop-payment", orderId: checkout.order.orderId, amount: 50000 };
  await confirmWorkshopPayment(env, confirmation);
  await confirmWorkshopPayment(env, confirmation);
  assert.equal(readAdminOutbox(database, "workshop.payment_completed").length, 1);
  assert.equal(readAdminOutbox(database, "workshop.payment_completed_admin").length, 1);
  await maintainWorkshopOperations(env, { now: new Date("2099-09-30T04:00:00Z") });
  await maintainWorkshopOperations(env, { now: new Date("2099-09-30T04:00:00Z") });
  assert.equal(readAdminOutbox(database, "workshop.reminder").length, 1);
});

test("notification admin page exposes customer and administrator views", () => {
  const html = readFileSync(new URL("../notification-admin.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../runtime/storefront/scripts/notification-admin-20260824-01.js", import.meta.url), "utf8");
  assert.match(html, /data-notification-audience="customer"[^>]*>고객 알림</);
  assert.match(html, /data-notification-audience="admin"[^>]*>관리자 알림</);
  assert.match(script, /endsWith\("_admin"\)/);
  assert.match(script, /includes\("_to_admin"\)/);
});

test("verified Shop webhooks recover failed outbox writes and deduplicate both audiences", async (t) => {
  const { database, env } = createEnvironment({ TOSS_CLIENT_KEY: "live_gck_fixture", TOSS_SECRET_KEY: "live_gsk_fixture" });
  t.after(() => database.close());
  await persistOrder(env, createOrder("ORDER_WEBHOOK"));
  const payment = { paymentKey: "webhook-key", orderId: "ORDER_WEBHOOK", totalAmount: 42000, currency: "KRW", status: "DONE", approvedAt: new Date().toISOString() };
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.method, "GET");
    return Response.json(payment);
  };
  const originalPrepare = database.prepare.bind(database);
  let failOnce = true;
  database.prepare = (sql) => {
    if (failOnce && /INSERT.*INTO notification_outbox/s.test(sql)) {
      failOnce = false;
      throw new Error("simulated outbox write failure");
    }
    return originalPrepare(sql);
  };
  const delivery = () => {
    const { context } = createContext(env, "/api/webhooks/toss", { eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey: payment.paymentKey, status: "CANCELED", totalAmount: 1 } });
    context.request.headers.set("tosspayments-webhook-transmission-id", "delivery-fixture");
    return context;
  };
  assert.equal((await tossWebhook(delivery())).status, 500);
  assert.equal((await tossWebhook(delivery())).status, 200);
  assert.equal((await tossWebhook(delivery())).status, 200);
  assert.equal(database.prepare("SELECT status FROM orders WHERE id = 'ORDER_WEBHOOK'").first().status, "paid");
  assert.equal(readAdminOutbox(database, "shop.order_completed").length, 1);
  assert.equal(readAdminOutbox(database, "shop.order_completed_admin").length, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM payment_events WHERE delivery_id = 'delivery-fixture'").first().count, 1);

  payment.status = "CANCELED";
  payment.balanceAmount = 0;
  payment.cancels = [{ canceledAt: new Date().toISOString(), cancelAmount: 42000 }];
  assert.equal((await tossWebhook(delivery())).status, 200);
  assert.equal((await tossWebhook(delivery())).status, 200);
  assert.equal(database.prepare("SELECT status FROM orders WHERE id = 'ORDER_WEBHOOK'").first().status, "cancelled");
  assert.equal(readAdminOutbox(database, "shop.order_cancelled").length, 1);
  assert.equal(readAdminOutbox(database, "shop.refund_completed_admin").length, 1);
  assert.equal(database.prepare("SELECT status FROM shipments WHERE order_id = 'ORDER_WEBHOOK'").first().status, "cancelled");
});

test("Shop order lifecycle keeps one order across failed, partial refund, and cancelled states", async (t) => {
  const { database, env } = createEnvironment({ TOSS_CLIENT_KEY: "live_gck_fixture", TOSS_SECRET_KEY: "live_gsk_fixture" });
  t.after(() => database.close());
  await persistOrder(env, createOrder("ORDER_LIFECYCLE"));
  await persistOrder(env, createOrder("ORDER_DRAFT_ONLY"));

  const payment = {
    paymentKey: "lifecycle-payment-key",
    orderId: "ORDER_LIFECYCLE",
    totalAmount: 42000,
    balanceAmount: 42000,
    currency: "KRW",
    status: "ABORTED",
    lastTransactionKey: "transaction-failed",
  };
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json(payment);

  const deliver = async (deliveryId) => {
    const { context } = createContext(env, "/api/webhooks/toss", {
      eventType: "PAYMENT_STATUS_CHANGED",
      data: { paymentKey: payment.paymentKey },
    });
    context.request.headers.set("tosspayments-webhook-transmission-id", deliveryId);
    return tossWebhook(context);
  };

  assert.equal((await deliver("delivery-failed")).status, 200);
  assert.deepEqual({ ...database.prepare("SELECT status, payment_status FROM orders WHERE id = 'ORDER_LIFECYCLE'").first() }, {
    status: "payment_failed",
    payment_status: "failed",
  });

  payment.status = "DONE";
  payment.approvedAt = new Date().toISOString();
  payment.lastTransactionKey = "transaction-approved";
  assert.equal((await deliver("delivery-approved")).status, 200);

  payment.status = "PARTIAL_CANCELED";
  payment.balanceAmount = 21000;
  payment.lastTransactionKey = "transaction-partial";
  payment.cancels = [{ canceledAt: new Date().toISOString(), cancelAmount: 21000, transactionKey: "transaction-partial" }];
  assert.equal((await deliver("delivery-partial")).status, 200);
  assert.deepEqual({ ...database.prepare("SELECT status, payment_status FROM orders WHERE id = 'ORDER_LIFECYCLE'").first() }, {
    status: "partially_refunded",
    payment_status: "partial_refunded",
  });

  payment.status = "CANCELED";
  payment.balanceAmount = 0;
  payment.lastTransactionKey = "transaction-cancelled";
  payment.cancels.push({ canceledAt: new Date().toISOString(), cancelAmount: 21000, transactionKey: "transaction-cancelled" });
  assert.equal((await deliver("delivery-cancelled")).status, 200);
  assert.deepEqual({ ...database.prepare("SELECT status, payment_status FROM orders WHERE id = 'ORDER_LIFECYCLE'").first() }, {
    status: "cancelled",
    payment_status: "cancelled",
  });

  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM orders WHERE id = 'ORDER_LIFECYCLE'").first().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM payment_events WHERE order_id = 'ORDER_LIFECYCLE'").first().count, 5);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM payment_events WHERE order_id = 'ORDER_LIFECYCLE' AND event_type = 'payment.partially_refunded'").first().count, 1);
  assert.deepEqual((await readFulfillmentOrders(env)).map((order) => order.orderId), ["ORDER_LIFECYCLE"]);
});

test("Workshop cancellation webhook settles a processing order without another cancel API call", async (t) => {
  const { database, env } = createEnvironment({ TOSS_CLIENT_KEY: "live_gck_fixture", TOSS_SECRET_KEY: "live_gsk_fixture", TOSS_PAYMENT_VARIANT_KEY: "CUSTOM", TOSS_AGREEMENT_VARIANT_KEY: "CUSTOM_AGREEMENT" });
  t.after(() => database.close());
  await upsertWorkshopContent(env, {
    slug: "webhook-workshop", title: "웹훅 워크숍", status: "published", price: 50000,
    scheduleSlots: [{ _key: "slot", date: "2099-10-02", startTime: "14:00", endTime: "17:00", capacity: 4 }], galleryImages: [],
    bookingConfig: { workshopType: "event", fixedPrice: 50000, minParticipants: 1, maxParticipants: 4, paymentDeadlineHours: 48 },
  });
  const available = await readWorkshopAvailability(env, "webhook-workshop");
  const { context } = createContext(env, "/api/workshops/reservations", { slug: "webhook-workshop", slotKey: available.scheduleSlots[0].key, fullName: "검증", email: "customer@example.com", phone: "01012345678", attendeeCount: 1 });
  const reservation = await (await createWorkshopReservation(context)).json();
  const checkout = await createWorkshopCheckout(env, { checkoutId: reservation.checkoutId });
  assert.equal(checkout.paymentVariantKey, "CUSTOM");
  assert.equal(checkout.agreementVariantKey, "CUSTOM_AGREEMENT");
  database.prepare("UPDATE workshop_payment_orders SET status = 'processing', payment_key = 'workshop-webhook-key'").run();
  const payment = { paymentKey: "workshop-webhook-key", orderId: checkout.order.orderId, totalAmount: 50000, currency: "KRW", status: "CANCELED", balanceAmount: 0, cancels: [{ canceledAt: new Date().toISOString(), cancelAmount: 50000 }] };
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.method, "GET", "webhooks must not initiate another refund");
    return Response.json(payment);
  };
  const delivery = () => createContext(env, "/api/webhooks/toss", { eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey: payment.paymentKey } }).context;
  assert.equal((await tossWebhook(delivery())).status, 200);
  assert.equal((await tossWebhook(delivery())).status, 200);
  assert.equal(database.prepare("SELECT status FROM workshop_payment_orders").first().status, "refunded");
  assert.equal(database.prepare("SELECT payment_status FROM workshop_reservations").first().payment_status, "refunded");
  assert.equal(readAdminOutbox(database, "workshop.refund_completed").length, 1);
  assert.equal(readAdminOutbox(database, "workshop.refund_completed_admin").length, 1);
});

test("forged webhook amounts and unknown orders cannot mutate paid state", async (t) => {
  const { database, env } = createEnvironment({ TOSS_SECRET_KEY: "live_gsk_fixture" });
  t.after(() => database.close());
  await persistOrder(env, createOrder("ORDER_MISMATCH"));
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({ paymentKey: "key", orderId: "ORDER_MISMATCH", status: "DONE", currency: "KRW", totalAmount: 1 });
  const { context } = createContext(env, "/api/webhooks/toss", { data: { paymentKey: "key", totalAmount: 42000 } });
  assert.equal((await tossWebhook(context)).status, 409);
  assert.equal(database.prepare("SELECT status FROM orders WHERE id = 'ORDER_MISMATCH'").first().status, "created");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM notification_outbox").first().count, 0);
});

test("partial refunds update the same order and send one administrator review alert instead of a full refund receipt", async (t) => {
  const { database, env } = createEnvironment({ TOSS_SECRET_KEY: "live_gsk_fixture" });
  t.after(() => database.close());
  await persistOrder(env, createOrder("ORDER_PARTIAL"));
  database.prepare("UPDATE orders SET status = 'paid', payment_status = 'confirmed', active_payment_key = 'partial-key' WHERE id = 'ORDER_PARTIAL'").run();
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const payment = { paymentKey: "partial-key", orderId: "ORDER_PARTIAL", status: "PARTIAL_CANCELED", currency: "KRW", totalAmount: 42000, balanceAmount: 21000 };
  globalThis.fetch = async () => Response.json(payment);
  for (let index = 0; index < 2; index++) {
    const { context } = createContext(env, "/api/webhooks/toss", { eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey: "partial-key" } });
    assert.equal((await tossWebhook(context)).status, 200);
  }
  assert.equal(database.prepare("SELECT status FROM orders WHERE id = 'ORDER_PARTIAL'").first().status, "partially_refunded");
  assert.equal(readAdminOutbox(database, "shop.refund_completed").length, 0);
  assert.equal(readAdminOutbox(database, "shop.payment_review_required_admin").length, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM payment_events WHERE event_type = 'payment.partial_refund_review'").first().count, 1);
  assert.match(database.prepare("SELECT body_text FROM notification_outbox WHERE template_key = 'shop.payment_review_required_admin'").first().body_text, /21,000원/);
});
