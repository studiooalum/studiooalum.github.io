import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { deleteCoupon, upsertCoupon } from "../cloudflare/lib/coupons.js";
import { deleteUnpaidOrder, persistOrder } from "../cloudflare/lib/d1.js";
import {
  archiveWorkshopContent,
  deleteWorkshopContent,
  deleteWorkshopReservation,
  upsertWorkshopContent,
} from "../cloudflare/lib/workshops.js";

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

function environment() {
  const database = new D1Database();
  return { database, env: { OALUM_DB: database } };
}

function orderInput(orderId, overrides = {}) {
  return {
    orderId,
    orderName: "테스트 주문",
    status: "created",
    paymentStatus: "pending",
    subtotalAmount: 10000,
    total: 10000,
    items: [{ lineId: "line-1", productId: "product-1", title: "테스트 상품", price: 10000, qty: 1 }],
    shipping: {
      name: "홍길동",
      phone: "010-1234-5678",
      email: "test@example.com",
      zipcode: "02400",
      address1: "서울시 테스트로 1",
      address2: "",
    },
    ...overrides,
  };
}

test("only unpaid orders without benefit or shipping history can be deleted", async (t) => {
  const { database, env } = environment();
  t.after(() => database.close());

  await persistOrder(env, orderInput("ORD_DELETE_OK"));
  await deleteUnpaidOrder(env, "ORD_DELETE_OK");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM orders WHERE id = 'ORD_DELETE_OK'").first().count, 0);

  await persistOrder(env, orderInput("ORD_DELETE_BLOCKED", { pointsUsed: 1000 }));
  await assert.rejects(
    deleteUnpaidOrder(env, "ORD_DELETE_BLOCKED"),
    (error) => error.status === 409 && /쿠폰 또는 포인트/.test(error.message),
  );
});

test("only coupons without use or order history can be deleted", async (t) => {
  const { database, env } = environment();
  t.after(() => database.close());

  const unusedCoupon = await upsertCoupon(env, {
    code: "DELETE-UNUSED",
    title: "삭제 가능한 쿠폰",
    scope: "public",
    discountType: "fixed",
    discountValue: 5000,
    minimumOrderAmount: 10000,
    usageLimit: 1,
    isActive: false,
  });
  await deleteCoupon(env, unusedCoupon.id);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM coupons WHERE id = ?").bind(unusedCoupon.id).first().count, 0);

  const usedCoupon = await upsertCoupon(env, {
    code: "DELETE-USED",
    title: "사용 이력이 있는 쿠폰",
    scope: "public",
    discountType: "fixed",
    discountValue: 5000,
    minimumOrderAmount: 10000,
    usageLimit: 1,
    isActive: false,
  });
  await persistOrder(env, orderInput("ORD_COUPON_HISTORY"));
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO coupon_redemptions (
      coupon_id, order_id, email_normalized, status, discount_amount, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(usedCoupon.id, "ORD_COUPON_HISTORY", "test@example.com", "applied", 5000, now, now).run();

  await assert.rejects(
    deleteCoupon(env, usedCoupon.id),
    (error) => error.status === 409 && /사용 또는 주문 이력/.test(error.message),
  );
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM coupons WHERE id = ?").bind(usedCoupon.id).first().count, 1);
});

function workshopInput(slug, status = "draft") {
  return {
    slug,
    title: `테스트 워크숍 ${slug}`,
    status,
    scheduleSlots: [],
    galleryImages: [],
    bookingConfig: {
      workshopType: "daily",
      dailyStartTime: "10:00",
      dailyEndTime: "13:00",
      dailyCapacity: 4,
      maxBookingMonths: 3,
      attendeePrices: { 1: 10000, 2: 18000, 3: 25000, 4: 30000 },
      minParticipants: 1,
      maxParticipants: 4,
      paymentDeadlineHours: 48,
    },
  };
}

test("workshop content and reservations follow safe deletion rules", async (t) => {
  const { database, env } = environment();
  t.after(() => database.close());

  await upsertWorkshopContent(env, workshopInput("delete-draft"));
  await deleteWorkshopContent(env, { slug: "delete-draft" });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM workshops WHERE slug = 'delete-draft'").first().count, 0);

  await upsertWorkshopContent(env, workshopInput("published-workshop", "published"));
  await assert.rejects(
    deleteWorkshopContent(env, { slug: "published-workshop" }),
    (error) => error.status === 409 && /먼저 보관/.test(error.message),
  );
  await archiveWorkshopContent(env, { slug: "published-workshop" });

  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO workshop_reservations (
      id, email, email_normalized, workshop_slug, workshop_title,
      slot_key, slot_date, slot_start_time, status, payment_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    "WRS_DELETE_OK", "guest@example.com", "guest@example.com", "published-workshop", "테스트 워크숍",
    "slot-delete", "2026-12-01", "10:00", "cancelled", "cancelled", now, now,
  ).run();
  await deleteWorkshopReservation(env, { reservationId: "WRS_DELETE_OK" });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM workshop_reservations WHERE id = 'WRS_DELETE_OK'").first().count, 0);

  database.prepare(`
    INSERT INTO workshop_reservations (
      id, email, email_normalized, workshop_slug, workshop_title,
      slot_key, slot_date, slot_start_time, status, payment_status, amount_paid, paid_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    "WRS_DELETE_BLOCKED", "paid@example.com", "paid@example.com", "published-workshop", "테스트 워크숍",
    "slot-paid", "2026-12-02", "10:00", "cancelled", "refunded", 10000, now, now, now,
  ).run();
  await assert.rejects(
    deleteWorkshopReservation(env, { reservationId: "WRS_DELETE_BLOCKED" }),
    (error) => error.status === 409 && /결제 또는 환불/.test(error.message),
  );
  await assert.rejects(
    deleteWorkshopContent(env, { slug: "published-workshop" }),
    (error) => error.status === 409 && /예약 이력/.test(error.message),
  );
});
