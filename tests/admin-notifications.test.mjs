import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { persistOrder } from "../cloudflare/lib/d1.js";
import {
  enqueueOrderCompletedAdminNotification,
  enqueueWorkshopReservationAdminNotification,
} from "../cloudflare/lib/notifications.js";
import {
  readWorkshopAvailability,
  upsertWorkshopContent,
} from "../cloudflare/lib/workshops.js";
import { onRequestPost as confirmPayment } from "../functions/api/payments/confirm.js";
import { onRequestPost as createWorkshopReservation } from "../functions/api/workshops/reservations.js";

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
  const { database, env } = createEnvironment();
  t.after(() => database.close());
  await persistOrder(env, createOrder("ORD-PAID-ADMIN"));

  const { context, flush } = createContext(env, "/api/payments/confirm", {
    orderId: "ORD-PAID-ADMIN",
    orderName: "테스트 주문",
    amount: 42000,
  });
  const response = await confirmPayment(context);
  assert.equal(response.status, 200);
  await flush();

  const [notification] = readAdminOutbox(database, "shop.order_completed_admin");
  assert.equal(notification.recipient, "admin@example.com");
  assert.equal(JSON.parse(notification.payload_json).order_number, "ORD-PAID-ADMIN");
});

test("workshop reservation queues the administrator alert", async (t) => {
  const { database, env } = createEnvironment();
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
});

test("notification admin page exposes customer and administrator views", () => {
  const html = readFileSync(new URL("../notification-admin.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../runtime/storefront/scripts/notification-admin-20260824-01.js", import.meta.url), "utf8");
  assert.match(html, /data-notification-audience="customer"[^>]*>고객 알림</);
  assert.match(html, /data-notification-audience="admin"[^>]*>관리자 알림</);
  assert.match(script, /endsWith\("_admin"\)/);
  assert.match(script, /includes\("_to_admin"\)/);
});
