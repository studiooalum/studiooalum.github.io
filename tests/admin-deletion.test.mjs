import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createWorkshopInquiry, readWorkshopInquiries } from "../cloudflare/lib/workshop-inquiries.js";
import { onRequestPost as confirmShopPayment } from "../functions/api/payments/confirm.js";
import { createSessionCookie, readAccount, readUserProfileImageKey, requestLoginCode, signupWithPassword, updateUserProfileImageKey } from "../cloudflare/lib/auth.js";
import { createAdminSession, requireAdminAccess } from "../cloudflare/lib/admin.js";
import { enforceRateLimit } from "../cloudflare/lib/request-security.js";
import { isPrivateR2Key } from "../cloudflare/lib/r2.js";
import { onRequestGet as getProfileImage, onRequestPost as uploadProfileImage } from "../functions/api/auth/profile-image.js";

import { deleteCoupon, upsertCoupon } from "../cloudflare/lib/coupons.js";
import { deleteUnpaidOrder, persistOrder } from "../cloudflare/lib/d1.js";
import { archiveNewsletterPost, deleteNewsletterPost, upsertNewsletterPost } from "../cloudflare/lib/newsletters.js";
import {
  archiveWorkshopContent,
  deleteWorkshopContent,
  deleteWorkshopReservation,
  createWorkshopReservation,
  readWorkshopAvailability,
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
    this.database.exec(readFileSync(new URL("../cloudflare/d1/migrations/0035_workshop_operations.sql", import.meta.url), "utf8"));
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

test("signup requires email ownership before creating an account", async (context) => {
  const { database, env } = environment();
  context.after(() => database.close());
  const input = { email: "unverified@example.com", fullName: "Unverified", password: "fixture-password", privacyConsent: true, termsConsent: true };
  await assert.rejects(signupWithPassword(env, input, new Request("https://studiooalum.test")), { status: 400 });
  await assert.rejects(signupWithPassword(env, { ...input, code: "000000" }, new Request("https://studiooalum.test")), { status: 400 });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM users").first().count, 0);
});

test("administrator sessions expire and public mutation limits cannot be exceeded", async (context) => {
  const { database, env } = environment();
  context.after(() => database.close());
  env.ORDER_ADMIN_SECRET = "fixture-admin-secret";
  const session = await createAdminSession(env, env.ORDER_ADMIN_SECRET);
  const request = new Request("https://studiooalum.test", { headers: { Authorization: `Bearer ${session.token}` } });
  assert.equal((await requireAdminAccess({ env, request })).method, "session");
  database.prepare("UPDATE admin_sessions SET created_at = '2020-01-01T00:00:00Z'").run();
  await assert.rejects(requireAdminAccess({ env, request }), { status: 401 });
  await enforceRateLimit(env, request, { scope: "test", limit: 1 });
  await assert.rejects(enforceRateLimit(env, request, { scope: "test", limit: 1 }), { status: 429 });
});

test("account profile images remain private and appear in the account contract", async (context) => {
  const { database, env } = environment();
  context.after(() => database.close());
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO users (id, email, email_normalized, full_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind("USER_PROFILE", "profile@example.com", "profile@example.com", "Profile", now, now).run();
  assert.equal(await updateUserProfileImageKey(env, "USER_PROFILE", "profile-images/user-profile/avatar.webp"), "");
  assert.equal(await readUserProfileImageKey(env, "USER_PROFILE"), "profile-images/user-profile/avatar.webp");
  const account = await readAccount(env, "USER_PROFILE");
  assert.equal(account.user.hasProfileImage, true);
  assert.equal(account.user.profileImageUrl, "/api/auth/profile-image");
  assert.doesNotMatch(JSON.stringify(account), /profile-images\/user-profile/);
});

test("authenticated users can upload and privately retrieve a profile image", async (context) => {
  const { database, env } = environment();
  context.after(() => database.close());
  const objects = new Map();
  env.AUTH_SECRET = "profile-test-secret";
  env.AUTH_DEBUG = "true";
  env.OALUM_R2 = {
    async put(key, body, options) { objects.set(key, { bytes: await new Response(body).arrayBuffer(), httpMetadata: options.httpMetadata }); },
    async get(key) {
      const object = objects.get(key);
      return object ? { body: new Blob([object.bytes]).stream(), httpMetadata: object.httpMetadata } : null;
    },
    async delete(key) { objects.delete(key); },
  };
  const email = "profile-upload@example.com";
  const code = (await requestLoginCode(env, { email, mode: "signup", fullName: "Profile Upload" })).debugCode;
  const request = new Request("https://studiooalum.test/signup");
  const signup = await signupWithPassword(env, {
    email, code, fullName: "Profile Upload", password: "fixture-password", privacyConsent: true, termsConsent: true,
  }, request);
  const cookie = createSessionCookie(request, env, signup.session.token);
  const formData = new FormData();
  formData.set("image", new File(["profile-image"], "avatar.webp", { type: "image/webp" }));
  const uploadResponse = await uploadProfileImage({ env, request: new Request("https://studiooalum.test/api/auth/profile-image", {
    method: "POST", headers: { Cookie: cookie }, body: formData,
  }) });
  assert.equal(uploadResponse.status, 200);
  const key = await readUserProfileImageKey(env, signup.user.id);
  assert.equal(isPrivateR2Key(key), true);
  const imageResponse = await getProfileImage({ env, request: new Request("https://studiooalum.test/api/auth/profile-image", { headers: { Cookie: cookie } }) });
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("Cache-Control"), "private, no-store");
  assert.equal(await imageResponse.text(), "profile-image");
  const unauthorized = await getProfileImage({ env, request: new Request("https://studiooalum.test/api/auth/profile-image") });
  assert.equal(unauthorized.status, 401);
});

test("custom workshop inquiries persist once with customer and administrator email notifications", async (context) => {
  const { database, env } = environment();
  context.after(() => database.close());
  const input = { requestId: crypto.randomUUID(), fullName: "Applicant", email: "custom@example.com", phone: "01012345678",
    attendeeCount: 12, preferredSchedule: "2026-12-01 14:00", locationType: "studio", classContent: "Basic sewing", question: "", privacyConsent: true };
  const first = await createWorkshopInquiry(env, input);
  assert.deepEqual(await createWorkshopInquiry(env, input), first);
  assert.equal((await readWorkshopInquiries(env)).length, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM notification_outbox WHERE entity_type = 'workshop_inquiry' AND channel = 'email'").first().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM notification_outbox WHERE channel = 'sms'").first().count, 0);
  await assert.rejects(createWorkshopInquiry(env, { ...input, privacyConsent: false }), { status: 400 });
  await assert.rejects(createWorkshopInquiry(env, { ...input, locationType: "other", locationDetail: "" }), { status: 400 });
});

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

test("shop confirmation rejects client amount tampering before contacting Toss", async (context) => {
  const { database, env } = environment();
  context.after(() => database.close());
  await persistOrder(env, orderInput("ORDER_AMOUNT_GUARD"));
  const response = await confirmShopPayment({ env, request: new Request("https://studiooalum.test/api/payments/confirm", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: "ORDER_AMOUNT_GUARD", paymentKey: "forged-payment", amount: 1 }),
  }) });
  assert.equal(response.status, 409);
  assert.equal(database.prepare("SELECT status FROM orders WHERE id = 'ORDER_AMOUNT_GUARD'").first().status, "created");
});

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

test("published newsletters must be archived before permanent deletion", async (t) => {
  const { database, env } = environment();
  t.after(() => database.close());

  await upsertNewsletterPost(env, {
    slug: "published-delete-guard",
    title: "게시 중 삭제 보호",
    contentHtml: "<p>게시된 뉴스레터입니다.</p>",
    status: "published",
  });
  await assert.rejects(
    deleteNewsletterPost(env, { slug: "published-delete-guard" }),
    (error) => error.status === 409 && /먼저 보관/.test(error.message),
  );
  await archiveNewsletterPost(env, { slug: "published-delete-guard" });
  await deleteNewsletterPost(env, { slug: "published-delete-guard" });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM newsletter_posts WHERE slug = 'published-delete-guard'").first().count, 0);

  await upsertNewsletterPost(env, {
    slug: "draft-delete",
    title: "초안 삭제",
    contentHtml: "<p>초안입니다.</p>",
    status: "draft",
  });
  await deleteNewsletterPost(env, { slug: "draft-delete" });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM newsletter_posts WHERE slug = 'draft-delete'").first().count, 0);
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

test("one-day applications charge the entire party at the chosen time and ignore legacy joining", async (context) => {
  const { database, env } = environment();
  context.after(() => database.close());
  const input = workshopInput("private-class", "published");
  input.bookingConfig.dailyTimeSlots = [{ startTime: "10:00", endTime: "13:00" }, { startTime: "14:00", endTime: "17:00" }];
  await upsertWorkshopContent(env, input);
  const workshop = await readWorkshopAvailability(env, input.slug);
  const slot = workshop.scheduleSlots[1];
  const reservationInput = { slug: input.slug, slotKey: slot.key, requestedDate: slot.date, attendeeCount: 2, fullName: "Applicant", email: "applicant@example.com", phone: "01012345678", allowAdditionalAttendees: true };
  const result = await createWorkshopReservation(env, reservationInput);
  assert.equal(result.reservation.joinPolicy, "private");
  assert.equal(result.reservation.slotStartTime, "14:00");
  assert.equal(result.reservation.amountDue, 18000);
  assert.equal(result.reservation.groupId, null);
  await assert.rejects(createWorkshopReservation(env, { ...reservationInput, email: "another@example.com" }), { status: 409 });
  const updated = await readWorkshopAvailability(env, input.slug);
  assert.equal(updated.scheduleSlots[0].status, "open");
  assert.equal(updated.scheduleSlots[1].status, "blocked");
});

test("OALUM workshops reserve every session and charge the full course per attendee", async (context) => {
  const { database, env } = environment();
  context.after(() => database.close());
  await upsertWorkshopContent(env, {
    slug: "course", title: "Course", status: "published", price: 90000, maxCapacity: 6,
    bookingConfig: { workshopType: "event", fixedPrice: 90000, minParticipants: 2, maxParticipants: 6 },
    scheduleSlots: [{ date: "2099-01-01", startTime: "10:00", endTime: "12:00", capacity: 6 }, { date: "2099-01-08", startTime: "10:00", endTime: "12:00", capacity: 6 }],
  });
  const result = await createWorkshopReservation(env, { slug: "course", attendeeCount: 2, fullName: "Applicant", email: "course@example.com", phone: "01012345678" });
  assert.equal(result.reservation.amountDue, 180000);
  assert.equal(result.reservation.slotSnapshot.slots.length, 2);
  assert.equal(result.reservation.slotKey, "course:series");
  assert.equal(result.workshop.scheduleSlots[1].remainingCapacity, 4);
});

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
