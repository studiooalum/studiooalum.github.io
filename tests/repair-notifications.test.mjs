import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  createRepairGalleryImage,
  createRepairCustomerInquiry,
  createRepairRequest,
  deleteRepairRequest,
  readRepairAdminSnapshot,
  readRepairGallery,
  readRepairRequestBySubmissionId,
  updateRepairRequest,
} from "../cloudflare/lib/repairs.js";
import { lookupGuestResource, verifyGuestLookupToken } from "../cloudflare/lib/guest-lookup.js";
import {
  activateNotificationDraft,
  createManualNotificationRetry,
  deleteNotificationRevision,
  processNotificationOutbox,
  purgeNotificationHistory,
  restoreNotificationDefault,
  saveNotificationDraft,
  validateNotificationTemplate,
} from "../cloudflare/lib/notifications.js";
import { createRepairTicketMessage, markRepairTicketRead, readRepairTicketForRepair } from "../cloudflare/lib/repair-tickets.js";
import { createRepairTicketAccessToken, verifyRepairTicketAccessToken } from "../cloudflare/lib/repair-ticket-tokens.js";
import { onRequestPost as submitRepairRequest } from "../functions/api/repairs/index.js";
import { onRequestPost as postRepairTicketMessage } from "../functions/api/repairs/tickets/[id].js";
import { inferRepairCountryCode } from "../cloudflare/lib/repair-address.js";

class D1BoundStatement {
  constructor(statement, values) {
    this.statement = statement;
    this.values = values;
  }

  first() {
    return this.statement.get(...this.values) || null;
  }

  all() {
    return { results: this.statement.all(...this.values) };
  }

  run() {
    const result = this.statement.run(...this.values);
    return { meta: { changes: Number(result.changes || 0) } };
  }
}

class D1Statement {
  constructor(database, sql) {
    this.statement = database.prepare(sql);
  }

  bind(...values) {
    return new D1BoundStatement(this.statement, values);
  }

  first() {
    return new D1BoundStatement(this.statement, []).first();
  }

  all() {
    return new D1BoundStatement(this.statement, []).all();
  }

  run() {
    return new D1BoundStatement(this.statement, []).run();
  }
}

class D1Database {
  constructor() {
    this.database = new DatabaseSync(":memory:");
    this.database.exec("PRAGMA foreign_keys = ON");
  }

  prepare(sql) {
    return new D1Statement(this.database, sql);
  }

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

  exec(sql) {
    this.database.exec(sql);
  }

  close() {
    this.database.close();
  }
}

const migrationNames = [
  "0013_repair_requests.sql",
  "0014_repair_request_contract.sql",
  "0016_repair_final_amount.sql",
  "0019_repair_gallery.sql",
  "0020_repair_notifications.sql",
  "0021_repair_tickets_and_notifications.sql",
];

function createEnvironment(overrides = {}) {
  return createFullEnvironment(overrides);
}

function createFullEnvironment(overrides = {}) {
  const database = new D1Database();
  database.exec(readFileSync(new URL("../cloudflare/d1/schema.sql", import.meta.url), "utf8"));
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

async function createInitialRepair(env, suffix = "A", overrides = {}) {
  return createRepairRequest(env, {
    requestId: `RPR_${suffix}`,
    requestNumber: `REP-20260823-${suffix}`,
    submissionId: `submission:${suffix}:1234567890`,
    submissionFingerprint: `fingerprint-${suffix}`,
    customerName: "홍길동",
    email: `customer-${suffix.toLowerCase()}@example.com`,
    phone: "010-1234-5678",
    countryCode: "OTHER",
    shippingAddress: "123 Main Street, Portland, OR, USA",
    itemType: "자켓",
    issueDescription: "소매가 찢어졌습니다.",
    repairDetails: "소매가 찢어졌습니다.",
    desiredResult: "수선 흔적을 살리고 싶어요",
    budgetNote: "",
    preferredContact: "phone",
    contactPreference: "phone",
    termsAcceptedAt: "2026-08-23T00:00:00.000Z",
    privacyConsentAt: "2026-08-23T00:00:00.000Z",
    ...overrides,
  });
}

function createRepairForm({ imageBody = "image-a", email = "customer@example.com" } = {}) {
  const formData = new FormData();
  formData.set("customerName", "홍길동");
  formData.set("email", email);
  formData.set("phone", "010-1234-5678");
  formData.set("shippingAddress", "123 Main Street, Portland, OR, USA");
  formData.set("itemType", "자켓");
  formData.set("issueDescription", "소매가 찢어졌습니다.");
  formData.set("desiredResult", "수선 흔적을 살리고 싶어요");
  formData.set("privacyConsent", "true");
  formData.append("images", new File([imageBody], "repair.png", { type: "image/png" }));
  return formData;
}

function createRepairApiContext(env, submissionId, options = {}) {
  return {
    env,
    request: new Request("https://studiooalum.test/api/repairs", {
      method: "POST",
      headers: { "Idempotency-Key": submissionId },
      body: createRepairForm(options),
    }),
  };
}

test("Repair gallery persists average color in its public image contract", async (t) => {
  const { database, env } = createFullEnvironment();
  t.after(() => database.close());

  await createRepairGalleryImage(env, {
    id: "RPG_COLOR",
    r2Key: "repair-gallery/color.jpg",
    filename: "color.jpg",
    contentType: "image/jpeg",
    methods: ["patch"],
    averageRgb: "18, 52, 86",
  });

  const [image] = await readRepairGallery(env);
  assert.equal(image.averageRgb, "18, 52, 86");
  assert.equal(image.url, "/api/r2?key=repair-gallery%2Fcolor.jpg&rgb=18%2C+52%2C+86");
  assert.equal(database.prepare("SELECT average_rgb FROM repair_gallery_images WHERE id = ?").bind("RPG_COLOR").first().average_rgb, "18, 52, 86");
});

test("Repair gallery color migration preserves legacy rows", (t) => {
  const database = new D1Database();
  t.after(() => database.close());
  database.exec(readFileSync(new URL("../cloudflare/d1/migrations/0019_repair_gallery.sql", import.meta.url), "utf8"));
  database.prepare(`
    INSERT INTO repair_gallery_images (
      id, r2_key, original_filename, content_type, methods_json,
      sort_order, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    "RPG_LEGACY",
    "repair-gallery/legacy.jpg",
    "legacy.jpg",
    "image/jpeg",
    '["woven"]',
    1,
    "published",
    "2026-08-20T00:00:00.000Z",
    "2026-08-20T00:00:00.000Z",
  ).run();

  database.exec(readFileSync(new URL("../cloudflare/d1/migrations/0023_repair_gallery_average_rgb.sql", import.meta.url), "utf8"));
  const row = database.prepare("SELECT id, r2_key, average_rgb FROM repair_gallery_images WHERE id = ?").bind("RPG_LEGACY").first();
  assert.equal(row.id, "RPG_LEGACY");
  assert.equal(row.r2_key, "repair-gallery/legacy.jpg");
  assert.equal(row.average_rgb, "");
});

test("Repair shipping address derives country and migration preserves legacy rows", (t) => {
  assert.equal(inferRepairCountryCode({ shippingAddress: "[02450] 서울특별시 동대문구 이문로 145" }), "KR");
  assert.equal(inferRepairCountryCode({ shippingAddress: "145 Imun-ro, Seoul, South Korea 02450" }), "KR");
  assert.equal(inferRepairCountryCode({ shippingAddress: "123 Main Street, Portland, OR, USA" }), "OTHER");
  assert.equal(inferRepairCountryCode({ shippingAddress: "일본 오사카시 주오구 1-2-3" }), "OTHER");
  assert.equal(inferRepairCountryCode({ shippingAddress: "베트남 호치민시 1군" }), "OTHER");
  assert.equal(inferRepairCountryCode({ shippingAddress: "Pyongyang, North Korea" }), "OTHER");
  assert.equal(inferRepairCountryCode({ shippingAddress: "Korea Town, Los Angeles" }), "OTHER");
  assert.equal(inferRepairCountryCode({ shippingAddress: "South Korean Cultural Center, LA" }), "OTHER");
  assert.equal(inferRepairCountryCode({ shippingAddress: "서울시립대학교 기숙사" }), "OTHER");
  assert.equal(inferRepairCountryCode({ shippingAddress: "[한국] 경기도 성남시" }), "KR");

  const database = new D1Database();
  t.after(() => database.close());
  database.exec("CREATE TABLE repair_requests (id TEXT PRIMARY KEY)");
  database.exec("INSERT INTO repair_requests (id) VALUES ('RPR_LEGACY')");
  database.exec(readFileSync(new URL("../cloudflare/d1/migrations/0024_repair_shipping_address.sql", import.meta.url), "utf8"));
  const row = database.prepare("SELECT id, shipping_address FROM repair_requests WHERE id = ?").bind("RPR_LEGACY").first();
  assert.equal(row.id, "RPR_LEGACY");
  assert.equal(row.shipping_address, "");
});

test("notification migration preserves completed work and locks archived legacy cases", (t) => {
  const database = new D1Database();
  t.after(() => database.close());
  for (const name of migrationNames.slice(0, -2)) {
    database.exec(readFileSync(new URL(`../cloudflare/d1/migrations/${name}`, import.meta.url), "utf8"));
  }
  const insert = database.prepare(`
    INSERT INTO repair_requests (
      id, request_number, customer_name, email, email_normalized, terms_accepted_at,
      privacy_consent_at, status, completed_at, archived_at, created_at, updated_at
    ) VALUES (?, ?, '고객', 'customer@example.com', 'customer@example.com', ?, ?, ?, ?, ?, ?, ?)
  `);
  insert.bind("RPR_COMPLETED", "REP-COMPLETED", "2026-08-20T00:00:00.000Z", "2026-08-20T00:00:00.000Z", "completed", "2026-08-21T00:00:00.000Z", null, "2026-08-20T00:00:00.000Z", "2026-08-21T00:00:00.000Z").run();
  insert.bind("RPR_ARCHIVED", "REP-ARCHIVED", "2026-08-18T00:00:00.000Z", "2026-08-18T00:00:00.000Z", "completed", "2026-08-19T00:00:00.000Z", "2026-08-20T00:00:00.000Z", "2026-08-18T00:00:00.000Z", "2026-08-20T00:00:00.000Z").run();
  database.exec(readFileSync(new URL("../cloudflare/d1/migrations/0020_repair_notifications.sql", import.meta.url), "utf8"));
  const completed = database.prepare("SELECT status, closed_at FROM repair_requests WHERE id = 'RPR_COMPLETED'").first();
  const archived = database.prepare("SELECT status, closed_at FROM repair_requests WHERE id = 'RPR_ARCHIVED'").first();
  assert.equal(completed.status, "payment_pending");
  assert.equal(completed.closed_at, null);
  assert.equal(archived.status, "closed");
  assert.equal(archived.closed_at, "2026-08-20T00:00:00.000Z");
});

test("POST /api/repairs returns the original receipt for repeated submission keys", async (t) => {
  const objects = new Map();
  let putCount = 0;
  const bucket = {
    async put(key, body) {
      putCount += 1;
      objects.set(key, await new Response(body).arrayBuffer());
    },
    async delete(key) {
      objects.delete(key);
    },
  };
  const { database, env } = createFullEnvironment({ OALUM_R2: bucket });
  t.after(() => database.close());
  const submissionId = "repair:11111111-1111-4111-8111-111111111111";

  const missingKeyContext = createRepairApiContext(env, "repair:33333333-3333-4333-8333-333333333333");
  missingKeyContext.request = new Request("https://studiooalum.test/api/repairs", {
    method: "POST",
    body: createRepairForm(),
  });
  const missingKeyResponse = await submitRepairRequest(missingKeyContext);
  assert.equal(missingKeyResponse.status, 400);
  assert.match((await missingKeyResponse.json()).error, /요청 키/);

  const invalidEmailResponse = await submitRepairRequest(createRepairApiContext(
    env,
    "repair:22222222-2222-4222-8222-222222222222",
    { email: "invalid-email" },
  ));
  assert.equal(invalidEmailResponse.status, 400);

  const firstResponse = await submitRepairRequest(createRepairApiContext(env, submissionId));
  const first = await firstResponse.json();
  assert.equal(firstResponse.status, 201);
  assert.equal(first.duplicate, false);

  const repeatedResponse = await submitRepairRequest(createRepairApiContext(env, submissionId));
  const repeated = await repeatedResponse.json();
  assert.equal(repeatedResponse.status, 200);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.requestNumber, first.requestNumber);
  assert.equal(putCount, 1);
  assert.equal(database.prepare("SELECT COUNT(1) AS count FROM repair_requests").first().count, 1);
  const storedRequest = database.prepare("SELECT shipping_address, country_code FROM repair_requests LIMIT 1").first();
  assert.equal(storedRequest.shipping_address, "123 Main Street, Portland, OR, USA");
  assert.equal(storedRequest.country_code, "OTHER");
  assert.equal(database.prepare("SELECT COUNT(1) AS count FROM notification_outbox").first().count, 1);
  assert.equal(database.prepare("SELECT COUNT(1) AS count FROM repair_tickets").first().count, 1);

  const conflictingResponse = await submitRepairRequest(createRepairApiContext(env, submissionId, { imageBody: "different-image" }));
  assert.equal(conflictingResponse.status, 409);
  assert.match((await conflictingResponse.json()).error, /다른 접수 내용/);

  const legacyForm = createRepairForm({ imageBody: "legacy-image" });
  legacyForm.delete("shippingAddress");
  legacyForm.set("countryCode", "KR");
  const legacyResponse = await submitRepairRequest({
    env,
    request: new Request("https://studiooalum.test/api/repairs", {
      method: "POST",
      headers: { "Idempotency-Key": "repair:44444444-4444-4444-8444-444444444444" },
      body: legacyForm,
    }),
  });
  assert.equal(legacyResponse.status, 201);
  const legacyRequest = database.prepare("SELECT shipping_address, country_code FROM repair_requests WHERE submission_id = ?").bind("repair:44444444-4444-4444-8444-444444444444").first();
  assert.equal(legacyRequest.shipping_address, "");
  assert.equal(legacyRequest.country_code, "KR");

  const shortAddressForm = createRepairForm({ imageBody: "short-address-image" });
  shortAddressForm.set("shippingAddress", "US");
  shortAddressForm.set("countryCode", "OTHER");
  const shortAddressResponse = await submitRepairRequest({
    env,
    request: new Request("https://studiooalum.test/api/repairs", {
      method: "POST",
      headers: { "Idempotency-Key": "repair:55555555-5555-4555-8555-555555555555" },
      body: shortAddressForm,
    }),
  });
  assert.equal(shortAddressResponse.status, 400);
  assert.match((await shortAddressResponse.json()).error, /발송지 주소/);
});

test("submission stores request, event, and rendered outbox atomically", async (t) => {
  const { database, env } = createEnvironment();
  t.after(() => database.close());

  const receipt = await createInitialRepair(env);
  assert.equal(receipt.notificationIds.length, 1);
  assert.equal(database.prepare("SELECT COUNT(1) AS count FROM repair_requests").first().count, 1);
  assert.equal(database.prepare("SELECT COUNT(1) AS count FROM repair_events").first().count, 1);
  assert.equal(database.prepare("SELECT COUNT(1) AS count FROM notification_outbox").first().count, 1);
  assert.equal(database.prepare("SELECT COUNT(1) AS count FROM repair_tickets").first().count, 1);
  assert.equal(database.prepare("SELECT COUNT(1) AS count FROM repair_ticket_messages").first().count, 1);

  const existing = await readRepairRequestBySubmissionId(env, "submission:A:1234567890");
  assert.equal(existing.requestNumber, "REP-20260823-A");
  assert.equal(existing.submissionFingerprint, "fingerprint-A");
});

test("status transitions validate fields, avoid duplicate events, and lock closed cases", async (t) => {
  const { database, env } = createEnvironment();
  t.after(() => database.close());
  await createInitialRepair(env);

  const noChange = await updateRepairRequest(env, {
    id: "RPR_A",
    expectedVersion: 1,
    status: "received",
  });
  assert.equal(noChange.operation.changed, false);
  assert.equal(database.prepare("SELECT COUNT(1) AS count FROM repair_events").first().count, 1);

  await assert.rejects(
    updateRepairRequest(env, { id: "RPR_A", expectedVersion: 1, status: "payment_pending" }),
    /최종 금액/,
  );
  await assert.rejects(
    updateRepairRequest(env, { id: "RPR_A", expectedVersion: 1, status: "payment_pending", finalAmount: 30000 }),
    /입금 계좌 또는 결제 안내/,
  );
  const payment = await updateRepairRequest(env, {
    id: "RPR_A",
    expectedVersion: 1,
    status: "payment_pending",
    finalAmount: 30000,
    bankAccount: "테스트은행 123-456",
  });
  assert.equal(payment.operation.statusChanged, true);
  assert.equal(payment.operation.notificationIds.length, 1);
  assert.equal(payment.requests[0].version, 2);

  const repeated = await updateRepairRequest(env, {
    id: "RPR_A",
    expectedVersion: 2,
    status: "payment_pending",
    finalAmount: 30000,
    bankAccount: "테스트은행 123-456",
  });
  assert.equal(repeated.operation.changed, false);
  assert.equal(database.prepare("SELECT COUNT(1) AS count FROM repair_events").first().count, 2);

  await assert.rejects(
    updateRepairRequest(env, {
      id: "RPR_A",
      expectedVersion: 2,
      status: "shipping",
      carrier: "CJ대한통운",
      trackingNumber: "1234",
    }),
    /입금 확인일/,
  );
  await assert.rejects(
    updateRepairRequest(env, {
      id: "RPR_A",
      expectedVersion: 2,
      status: "shipping",
      paymentConfirmedAt: "2026-08-23T12:00:00.000Z",
      carrier: "CJ대한통운",
    }),
    /운송장 번호/,
  );

  const competingUpdates = await Promise.allSettled([
    updateRepairRequest(env, {
      id: "RPR_A",
      expectedVersion: 2,
      status: "shipping",
      paymentConfirmedAt: "2026-08-23T12:00:00.000Z",
      carrier: "CJ대한통운",
      trackingNumber: "1234",
    }),
    updateRepairRequest(env, {
      id: "RPR_A",
      expectedVersion: 2,
      status: "shipping",
      paymentConfirmedAt: "2026-08-23T12:00:00.000Z",
      carrier: "CJ대한통운",
      trackingNumber: "1234",
    }),
  ]);
  assert.equal(competingUpdates.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(competingUpdates.filter((result) => result.status === "rejected").length, 1);
  assert.equal(competingUpdates.find((result) => result.status === "rejected").reason.status, 409);

  const closed = await updateRepairRequest(env, {
    id: "RPR_A",
    expectedVersion: 3,
    status: "closed",
  });
  assert.equal(closed.requests[0].isReadOnly, true);
  assert.ok(closed.requests[0].closedAt);
  await assert.rejects(
    updateRepairRequest(env, { id: "RPR_A", expectedVersion: 4, adminNote: "수정 시도" }),
    /읽기 전용/,
  );
  assert.equal(database.prepare("SELECT status FROM repair_tickets WHERE repair_id = 'RPR_A'").first().status, "closed");
});

test("inquiries are deduplicated, rate limited, and blocked after close", async (t) => {
  const { database, env } = createEnvironment();
  t.after(() => database.close());
  await createInitialRepair(env);

  const first = await createRepairCustomerInquiry(env, {
    requestId: "RPR_A",
    inquiryId: "inquiry:1234567890",
    message: "진행 상황이 궁금합니다.",
  }, { type: "guest", id: "REP-20260823-A" });
  assert.equal(first.duplicate, false);
  assert.equal(first.notificationIds.length, 1);

  const duplicate = await createRepairCustomerInquiry(env, {
    requestId: "RPR_A",
    inquiryId: "inquiry:1234567890",
    message: "진행 상황이 궁금합니다.",
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(database.prepare("SELECT COUNT(1) AS count FROM repair_customer_inquiries").first().count, 1);

  await assert.rejects(
    createRepairCustomerInquiry(env, {
      requestId: "RPR_A",
      inquiryId: "inquiry:abcdefghij",
      message: "추가 문의입니다.",
    }),
    /5분/,
  );

  await createInitialRepair(env, "B");
  const concurrent = await Promise.allSettled([
    createRepairCustomerInquiry(env, {
      requestId: "RPR_B",
      inquiryId: "inquiry:parallel-one",
      message: "병렬 문의 1",
    }),
    createRepairCustomerInquiry(env, {
      requestId: "RPR_B",
      inquiryId: "inquiry:parallel-two",
      message: "병렬 문의 2",
    }),
  ]);
  assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);
  assert.equal(concurrent.find((result) => result.status === "rejected").reason.status, 429);

  await updateRepairRequest(env, { id: "RPR_A", expectedVersion: 1, status: "closed" });
  await assert.rejects(
    createRepairCustomerInquiry(env, {
      requestId: "RPR_A",
      inquiryId: "inquiry:closed-case",
      message: "종료 후 문의입니다.",
    }),
    /새 문의/,
  );
});

test("Repair Ticket supports threaded messages, attachments, unread counts, and closure", async (t) => {
  const { database, env } = createEnvironment();
  t.after(() => database.close());
  await createInitialRepair(env);
  const initial = await readRepairTicketForRepair(env, "RPR_A");
  assert.ok(initial?.ticket.id.startsWith("RPT_"));
  assert.equal(initial.ticket.messages.length, 1);
  assert.equal(initial.ticket.messages[0].authorType, "system");
  const signedAccess = await createRepairTicketAccessToken(env, initial.ticket.id, { ttlMs: 60_000 });
  assert.equal(await verifyRepairTicketAccessToken(env, signedAccess, initial.ticket.id), true);
  assert.equal(await verifyRepairTicketAccessToken(env, signedAccess, "RPT_OTHER"), false);

  const customer = await createRepairTicketMessage(env, {
    ticketId: initial.ticket.id,
    clientMessageId: "ticket:customer:1234567890",
    authorType: "customer",
    clientKey: "customer-key",
    body: "<script>alert(1)</script> 첫 번째 문의입니다.",
  }, [{
    id: "RTA_TEST",
    r2Key: "repair-tickets/test/message/image.png",
    filename: "image.png",
    contentType: "image/png",
    byteSize: 1200,
    sortOrder: 0,
  }]);
  assert.equal(customer.duplicate, false);
  assert.equal(customer.notificationIds.length, 1);

  const second = await createRepairTicketMessage(env, {
    ticketId: initial.ticket.id,
    clientMessageId: "ticket:customer:abcdefghij",
    authorType: "customer",
    clientKey: "customer-key",
    body: "5분 제한 없이 이어서 보내는 두 번째 문의입니다.",
  });
  assert.equal(second.duplicate, false);

  const duplicate = await createRepairTicketMessage(env, {
    ticketId: initial.ticket.id,
    clientMessageId: "ticket:customer:1234567890",
    authorType: "customer",
    clientKey: "customer-key",
    body: "첫 번째 문의입니다.",
  });
  assert.equal(duplicate.duplicate, true);

  const ticketAfterCustomer = await readRepairTicketForRepair(env, "RPR_A");
  assert.equal(ticketAfterCustomer.ticket.unreadAdminCount, 2);
  assert.equal(ticketAfterCustomer.ticket.messages[1].body.includes("<script>"), false);
  assert.equal(ticketAfterCustomer.ticket.messages[1].attachments.length, 1);
  await markRepairTicketRead(env, initial.ticket.id, "admin");
  assert.equal((await readRepairTicketForRepair(env, "RPR_A")).ticket.unreadAdminCount, 0);

  const admin = await createRepairTicketMessage(env, {
    ticketId: initial.ticket.id,
    clientMessageId: "ticket:admin:1234567890",
    authorType: "admin",
    clientKey: "admin-key",
    body: "확인 후 안내드리겠습니다.",
  });
  assert.equal(admin.notificationIds.length, 1);
  assert.equal((await readRepairTicketForRepair(env, "RPR_A")).ticket.unreadCustomerCount, 2);

  await updateRepairRequest(env, { id: "RPR_A", expectedVersion: 1, status: "in_progress" });
  const afterStatus = await readRepairTicketForRepair(env, "RPR_A");
  assert.equal(afterStatus.ticket.messages.at(-1).authorType, "system");
  assert.match(afterStatus.ticket.messages.at(-1).body, /수선 작업/);

  await updateRepairRequest(env, { id: "RPR_A", expectedVersion: 2, status: "closed" });
  const closed = await readRepairTicketForRepair(env, "RPR_A");
  assert.equal(closed.ticket.status, "closed");
  assert.ok(closed.ticket.closedAt);
  await assert.rejects(
    createRepairTicketMessage(env, {
      ticketId: initial.ticket.id,
      clientMessageId: "ticket:closed:1234567890",
      authorType: "customer",
      clientKey: "customer-key",
      body: "종료 후 메시지",
    }),
    /종료된 Repair Ticket/,
  );
});

test("Repair Ticket API stores private R2 image attachments and deduplicates retries", async (t) => {
  const objects = new Map();
  let putCount = 0;
  let deleteCount = 0;
  const bucket = {
    async put(key, body) {
      putCount += 1;
      objects.set(key, await new Response(body).arrayBuffer());
    },
    async delete(key) {
      deleteCount += 1;
      objects.delete(key);
    },
  };
  const { database, env } = createEnvironment({ OALUM_R2: bucket });
  t.after(() => database.close());
  await createInitialRepair(env);
  const ticket = (await readRepairTicketForRepair(env, "RPR_A")).ticket;
  const accessToken = await createRepairTicketAccessToken(env, ticket.id);
  const clientMessageId = "ticket:api:1234567890";

  const createContext = () => {
    const formData = new FormData();
    formData.set("body", "사진을 첨부한 Ticket 메시지입니다.");
    formData.set("client_message_id", clientMessageId);
    formData.append("attachments", new File(["image"], "ticket.png", { type: "image/png" }));
    return {
      env,
      params: { id: ticket.id },
      request: new Request(`https://studiooalum.test/api/repairs/tickets/${ticket.id}`, {
        method: "POST",
        headers: {
          "Idempotency-Key": clientMessageId,
          "X-Repair-Ticket-Access": accessToken,
        },
        body: formData,
      }),
    };
  };

  const firstResponse = await postRepairTicketMessage(createContext());
  assert.equal(firstResponse.status, 201);
  assert.equal((await firstResponse.json()).duplicate, false);
  const attachment = database.prepare("SELECT r2_key, content_type FROM repair_ticket_message_attachments LIMIT 1").first();
  assert.match(attachment.r2_key, /^repair-tickets\//);
  assert.equal(attachment.content_type, "image/png");
  assert.equal(putCount, 1);
  assert.equal(objects.size, 1);

  const repeatedResponse = await postRepairTicketMessage(createContext());
  assert.equal(repeatedResponse.status, 200);
  assert.equal((await repeatedResponse.json()).duplicate, true);
  assert.equal(putCount, 2);
  assert.equal(deleteCount, 1);
  assert.equal(objects.size, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM repair_ticket_messages WHERE client_message_id = ?").bind(clientMessageId).first().count, 1);
});

test("Notification templates enforce variables and support draft activation and restore", async (t) => {
  const { database, env } = createEnvironment();
  t.after(() => database.close());
  const row = database.prepare(`
    SELECT * FROM notification_templates
    WHERE template_key = 'repair.received' AND channel = 'email'
  `).first();
  const invalid = validateNotificationTemplate(row, {
    channel: "email",
    subject: "수신 완료",
    body: "{{unsupported_variable}}",
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((message) => message.includes("지원하지 않는 변수")));

  const body = "{{customer_name}}님, {{product_name}} 제품을 받았습니다. {{repair_ticket_url}}";
  await saveNotificationDraft(env, {
    templateKey: "repair.received",
    channel: "email",
    subject: "[Studio OALUM] 새 초안",
    body,
  }, "test-admin");
  await activateNotificationDraft(env, { templateKey: "repair.received", channel: "email" }, "test-admin");
  const active = database.prepare(`SELECT active_subject, active_body FROM notification_templates WHERE template_key = 'repair.received' AND channel = 'email'`).first();
  assert.equal(active.active_subject, "[Studio OALUM] 새 초안");
  assert.equal(active.active_body, body);
  await restoreNotificationDefault(env, { templateKey: "repair.received", channel: "email" }, "test-admin");
  const restored = database.prepare(`SELECT draft_subject, default_subject FROM notification_templates WHERE template_key = 'repair.received' AND channel = 'email'`).first();
  assert.equal(restored.draft_subject, restored.default_subject);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM notification_template_revisions").first().count, 3);
  assert.equal(database.prepare("SELECT is_enabled FROM notification_templates WHERE template_key = 'shop.order_completed' AND channel = 'email'").first().is_enabled, 0);
  await assert.rejects(
    activateNotificationDraft(env, { templateKey: "shop.order_completed", channel: "email" }, "test-admin"),
    /전환 준비 템플릿/,
  );
});

test("KR Repair emits four SMS milestones, Ticket email for other states, and dry-run fallback", async (t) => {
  const { database, env } = createEnvironment({
    SMS_ENABLED: "false",
    SMS_DRY_RUN: "true",
    SMS_COUNTRY_ALLOWLIST: "KR",
    RESEND_API_KEY: "test-key",
    RESEND_FROM_EMAIL: "Studio OALUM <noreply@example.com>",
  });
  t.after(() => database.close());
  const receipt = await createInitialRepair(env, "KR", {
    countryCode: "KR",
    shippingAddress: "[02450] 서울특별시 동대문구 이문로 145",
    email: "kr@example.com",
  });
  assert.equal(receipt.notificationIds.length, 1);

  await updateRepairRequest(env, { id: "RPR_KR", expectedVersion: 1, status: "item_received" });
  await updateRepairRequest(env, { id: "RPR_KR", expectedVersion: 2, status: "in_progress" });
  await updateRepairRequest(env, {
    id: "RPR_KR",
    expectedVersion: 3,
    status: "payment_pending",
    finalAmount: 45000,
    bankAccount: "테스트은행 123",
  });
  await updateRepairRequest(env, {
    id: "RPR_KR",
    expectedVersion: 4,
    status: "shipping",
    paymentConfirmedAt: "2026-08-24T10:00:00.000Z",
    carrier: "CJ대한통운",
    trackingNumber: "1234567890",
    trackingUrl: "https://example.com/tracking",
  });
  await updateRepairRequest(env, { id: "RPR_KR", expectedVersion: 5, status: "closed" });

  const rows = database.prepare(`
    SELECT template_key, channel FROM notification_outbox
    WHERE entity_id IN ('RPR_KR', (SELECT id FROM repair_tickets WHERE repair_id = 'RPR_KR'))
    ORDER BY created_at
  `).all().results;
  assert.deepEqual(rows.filter((row) => row.channel === "sms").map((row) => row.template_key), [
    "repair.application_submitted",
    "repair.received",
    "repair.repair_completed_quote_ready",
    "repair.payment_confirmed_shipping_started",
  ]);
  assert.equal(rows.filter((row) => row.template_key === "ticket.system_message_to_customer").length, 2);

  let providerCalled = false;
  const dryRun = await processNotificationOutbox(env, {
    ids: [receipt.notificationIds[0]],
    fetchImpl: async () => { providerCalled = true; throw new Error("must not call SOLAPI in dry-run"); },
  });
  assert.equal(providerCalled, false);
  assert.equal(dryRun.sent, 1);
  assert.equal(dryRun.fallback, 1);
  const fallback = database.prepare(`
    SELECT id, channel, status FROM notification_outbox
    WHERE event_key LIKE 'repair:RPR_KR:application_submitted:v1:sms:email-fallback'
  `).first();
  assert.equal(fallback.channel, "email");
  assert.equal(fallback.status, "pending");
});

test("outbox classifies success, retryable, unknown, and permanent failures", async (t) => {
  const { database, env } = createEnvironment({
    RESEND_API_KEY: "test-key",
    RESEND_FROM_EMAIL: "Studio OALUM <noreply@example.com>",
  });
  t.after(() => database.close());
  const receipt = await createInitialRepair(env);
  const [sentId] = receipt.notificationIds;

  let deliveryCalls = 0;
  const sent = await processNotificationOutbox(env, {
    ids: [sentId],
    fetchImpl: async () => {
      deliveryCalls += 1;
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    },
  });
  assert.equal(sent.sent, 1);
  const sentAgain = await processNotificationOutbox(env, {
    ids: [sentId],
    fetchImpl: async () => { throw new Error("sent messages must not run twice"); },
  });
  assert.equal(sentAgain.claimed, 0);
  assert.equal(deliveryCalls, 1);

  const manual = await createManualNotificationRetry(env, sentId, "test-admin");
  const manualSent = await processNotificationOutbox(env, {
    ids: [manual.id],
    fetchImpl: async () => new Response(JSON.stringify({ id: "email_manual" }), { status: 200 }),
  });
  assert.equal(manualSent.sent, 1);
  const manualRow = database.prepare("SELECT template_key, status FROM notification_outbox WHERE id = ?").bind(manual.id).first();
  assert.equal(manualRow.template_key, "repair.application_submitted");
  assert.equal(manualRow.status, "sent");

  await createInitialRepair(env, "G");
  const retryId = (await readRepairRequestBySubmissionId(env, "submission:G:1234567890")).notificationIds[0];
  const retried = await processNotificationOutbox(env, {
    ids: [retryId],
    fetchImpl: async () => new Response("rate limited", { status: 429 }),
  });
  assert.equal(retried.pending, 1);
  const retryRow = database.prepare("SELECT status, attempts, last_error FROM notification_outbox WHERE id = ?").bind(retryId).first();
  assert.equal(retryRow.status, "pending");
  assert.equal(retryRow.attempts, 1);

  await createInitialRepair(env, "D");
  const serverErrorId = (await readRepairRequestBySubmissionId(env, "submission:D:1234567890")).notificationIds[0];
  const serverError = await processNotificationOutbox(env, {
    ids: [serverErrorId],
    fetchImpl: async () => new Response("provider unavailable", { status: 500 }),
  });
  assert.equal(serverError.pending, 1);

  await createInitialRepair(env, "E");
  const networkErrorId = (await readRepairRequestBySubmissionId(env, "submission:E:1234567890")).notificationIds[0];
  const networkError = await processNotificationOutbox(env, {
    ids: [networkErrorId],
    fetchImpl: async () => { throw new TypeError("network disconnected"); },
  });
  assert.equal(networkError.pending, 1);

  await createInitialRepair(env, "B");
  const unknownId = (await readRepairRequestBySubmissionId(env, "submission:B:1234567890")).notificationIds[0];
  const unknown = await processNotificationOutbox(env, {
    ids: [unknownId],
    fetchImpl: async () => { throw Object.assign(new Error("timeout"), { name: "AbortError" }); },
  });
  assert.equal(unknown.unknown, 1);
  assert.equal(database.prepare("SELECT status FROM notification_outbox WHERE id = ?").bind(unknownId).first().status, "unknown");

  await createInitialRepair(env, "C");
  const failedId = (await readRepairRequestBySubmissionId(env, "submission:C:1234567890")).notificationIds[0];
  const missingEnv = { ...env, RESEND_API_KEY: "", RESEND_FROM_EMAIL: "" };
  const failed = await processNotificationOutbox(missingEnv, { ids: [failedId] });
  assert.equal(failed.failed, 1);
  assert.match(database.prepare("SELECT last_error FROM notification_outbox WHERE id = ?").bind(failedId).first().last_error, /RESEND_API_KEY/);

  await createInitialRepair(env, "F");
  const deadLetterId = (await readRepairRequestBySubmissionId(env, "submission:F:1234567890")).notificationIds[0];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    database.prepare("UPDATE notification_outbox SET available_at = ? WHERE id = ?").bind("2000-01-01T00:00:00.000Z", deadLetterId).run();
    await processNotificationOutbox(env, {
      ids: [deadLetterId],
      fetchImpl: async () => new Response("provider unavailable", { status: 500 }),
    });
  }
  const deadLetter = database.prepare("SELECT status, attempts FROM notification_outbox WHERE id = ?").bind(deadLetterId).first();
  assert.equal(deadLetter.status, "dead_letter");
  assert.equal(deadLetter.attempts, 5);
});

test("unified guest lookup resolves ORD, WKS, and REP references with short-lived hashed tokens", async (t) => {
  const { database, env } = createFullEnvironment();
  t.after(() => database.close());
  const now = "2026-08-23T00:00:00.000Z";
  database.prepare(`
    INSERT INTO orders (
      id, order_name, status, payment_status, total_amount, customer_name,
      customer_phone, customer_email, zipcode, address1, active_payment_key,
      created_at, updated_at
    ) VALUES (?, ?, 'confirmed', 'done', 25000, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    "OALUM-CF-ORDER-A",
    "테스트 주문",
    "홍길동",
    "010-1234-5678",
    "guest@example.com",
    "02400",
    "서울시 테스트로 1",
    "payment-key",
    now,
    now,
  ).run();
  database.prepare(`
    INSERT INTO workshop_reservations (
      id, email, email_normalized, full_name, phone, workshop_slug, workshop_title,
      slot_key, slot_date, slot_start_time, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    "WRS_TEST_A",
    "guest@example.com",
    "guest@example.com",
    "홍길동",
    "010-1234-5678",
    "visible-mending",
    "Visible Mending",
    "slot-a",
    "2026-09-01",
    "14:00",
    now,
    now,
  ).run();
  await createRepairRequest(env, {
    requestId: "RPR_GUEST",
    requestNumber: "REP-20260823-GUEST",
    submissionId: "submission:guest:1234567890",
    submissionFingerprint: "fingerprint-guest",
    customerName: "홍길동",
    email: "guest@example.com",
    phone: "010-1234-5678",
    shippingAddress: "[02400] 서울시 테스트로 1",
    itemType: "자켓",
    issueDescription: "테스트 수선",
    repairDetails: "테스트 수선",
    desiredResult: "잘 모르겠어요",
    termsAcceptedAt: now,
    privacyConsentAt: now,
  });

  const request = new Request("https://studiooalum.test/api/auth/guest-lookup", {
    headers: { "CF-Connecting-IP": "203.0.113.10" },
  });
  const order = await lookupGuestResource(env, request, { reference: "ORD-OALUM-CF-ORDER-A", email: "guest@example.com" });
  const workshop = await lookupGuestResource(env, request, { reference: "WKS-WRS_TEST_A", email: "guest@example.com" });
  const repair = await lookupGuestResource(env, request, { reference: "REP-20260823-GUEST", email: "guest@example.com" });
  assert.equal(order.resourceType, "order");
  assert.equal(order.resource.orderNumber, "ORD-OALUM-CF-ORDER-A");
  assert.equal(workshop.resourceType, "workshop");
  assert.equal(workshop.resource.reservationNumber, "WKS-WRS_TEST_A");
  assert.equal(repair.resourceType, "repair");
  assert.equal(repair.resource.requestNumber, "REP-20260823-GUEST");
  assert.ok(new Date(repair.expiresAt).getTime() - Date.now() <= 15 * 60 * 1000);
  const tokenRow = database.prepare("SELECT token_hash FROM guest_lookup_tokens WHERE resource_type = 'repair'").first();
  assert.notEqual(tokenRow.token_hash, repair.accessToken);
  const verified = await verifyGuestLookupToken(env, repair.accessToken, { resourceType: "repair", resourceId: "RPR_GUEST" });
  assert.equal(verified.reference, "REP-20260823-GUEST");

  const limitedRequest = new Request("https://studiooalum.test/api/auth/guest-lookup", {
    headers: { "CF-Connecting-IP": "203.0.113.11" },
  });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await assert.rejects(
      lookupGuestResource(env, limitedRequest, { reference: "REP-NOT-FOUND", email: "limited@example.com" }),
      (error) => error.status === 404,
    );
  }
  await assert.rejects(
    lookupGuestResource(env, limitedRequest, { reference: "REP-NOT-FOUND", email: "limited@example.com" }),
    (error) => error.status === 429,
  );

  const ipLimitedRequest = new Request("https://studiooalum.test/api/auth/guest-lookup", {
    headers: { "CF-Connecting-IP": "203.0.113.12" },
  });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await assert.rejects(
      lookupGuestResource(env, ipLimitedRequest, {
        reference: "REP-NOT-FOUND",
        email: `rotating-${attempt}@example.com`,
      }),
      (error) => error.status === 404,
    );
  }
  await assert.rejects(
    lookupGuestResource(env, ipLimitedRequest, {
      reference: "REP-NOT-FOUND",
      email: "rotating-31@example.com",
    }),
    (error) => error.status === 429,
  );
});

test("admin deletion removes only eligible Repair requests", async (t) => {
  const { database, env } = createEnvironment();
  t.after(() => database.close());

  await createInitialRepair(env, "DELETE_OK");
  const removed = await deleteRepairRequest(env, "RPR_DELETE_OK");
  assert.equal(removed.requestId, "RPR_DELETE_OK");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM repair_requests WHERE id = 'RPR_DELETE_OK'").first().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM repair_tickets WHERE repair_id = 'RPR_DELETE_OK'").first().count, 0);

  await createInitialRepair(env, "DELETE_BLOCKED");
  database.prepare("UPDATE repair_requests SET final_amount = 50000 WHERE id = 'RPR_DELETE_BLOCKED'").run();
  await assert.rejects(
    deleteRepairRequest(env, "RPR_DELETE_BLOCKED"),
    (error) => error.status === 409 && /결제 또는 최종 금액/.test(error.message),
  );
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM repair_requests WHERE id = 'RPR_DELETE_BLOCKED'").first().count, 1);
});

test("notification history can delete revisions and purges only terminal old outbox rows", async (t) => {
  const { database, env } = createEnvironment();
  t.after(() => database.close());

  await saveNotificationDraft(env, {
    templateKey: "repair.received",
    channel: "email",
    subject: "[Studio OALUM] 정리 테스트",
    body: "{{customer_name}}님, {{product_name}} 접수가 완료되었습니다. {{repair_ticket_url}}",
  }, "test-admin");
  const revision = database.prepare("SELECT id FROM notification_template_revisions ORDER BY created_at DESC LIMIT 1").first();
  await deleteNotificationRevision(env, revision.id);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM notification_template_revisions WHERE id = ?").bind(revision.id).first().count, 0);

  await saveNotificationDraft(env, {
    templateKey: "repair.received",
    channel: "email",
    subject: "[Studio OALUM] 오래된 초안",
    body: "{{customer_name}}님, {{product_name}} 접수가 완료되었습니다. {{repair_ticket_url}}",
  }, "test-admin");
  database.prepare("UPDATE notification_template_revisions SET created_at = '2020-01-01T00:00:00.000Z'").run();
  const revisionsPurged = await purgeNotificationHistory(env, { scope: "revisions", olderThanDays: 30 });
  assert.equal(revisionsPurged.deletedCount, 1);

  await createInitialRepair(env, "OUTBOX_SENT");
  await createInitialRepair(env, "OUTBOX_PENDING");
  const outboxRows = database.prepare("SELECT id FROM notification_outbox ORDER BY created_at ASC").all().results;
  database.prepare("UPDATE notification_outbox SET status = 'sent', created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").bind(outboxRows[0].id).run();
  database.prepare("UPDATE notification_outbox SET status = 'pending', created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").bind(outboxRows[1].id).run();
  const outboxPurged = await purgeNotificationHistory(env, { scope: "outbox", olderThanDays: 90 });
  assert.equal(outboxPurged.deletedCount, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM notification_outbox WHERE id = ?").bind(outboxRows[1].id).first().count, 1);
});
