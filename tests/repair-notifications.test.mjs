import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  createRepairCustomerInquiry,
  createRepairRequest,
  readRepairAdminSnapshot,
  readRepairRequestBySubmissionId,
  updateRepairRequest,
} from "../cloudflare/lib/repairs.js";
import { lookupGuestResource, verifyGuestLookupToken } from "../cloudflare/lib/guest-lookup.js";
import { createManualRepairNotificationResend, processRepairNotificationOutbox } from "../cloudflare/lib/repair-notifications.js";
import { onRequestPost as submitRepairRequest } from "../functions/api/repairs/index.js";

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
];

function createEnvironment(overrides = {}) {
  const database = new D1Database();
  for (const name of migrationNames) {
    database.exec(readFileSync(new URL(`../cloudflare/d1/migrations/${name}`, import.meta.url), "utf8"));
  }
  return {
    database,
    env: {
      OALUM_DB: database,
      PUBLIC_SITE_URL: "https://studiooalum.test",
      REPAIR_ADMIN_EMAIL: "admin@example.com",
      ...overrides,
    },
  };
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
      ...overrides,
    },
  };
}

async function createInitialRepair(env, suffix = "A") {
  return createRepairRequest(env, {
    requestId: `RPR_${suffix}`,
    requestNumber: `REP-20260823-${suffix}`,
    submissionId: `submission:${suffix}:1234567890`,
    submissionFingerprint: `fingerprint-${suffix}`,
    customerName: "홍길동",
    email: `customer-${suffix.toLowerCase()}@example.com`,
    phone: "010-1234-5678",
    itemType: "자켓",
    issueDescription: "소매가 찢어졌습니다.",
    repairDetails: "소매가 찢어졌습니다.",
    desiredResult: "수선 흔적을 살리고 싶어요",
    budgetNote: "",
    preferredContact: "phone",
    contactPreference: "phone",
    termsAcceptedAt: "2026-08-23T00:00:00.000Z",
    privacyConsentAt: "2026-08-23T00:00:00.000Z",
  });
}

function createRepairForm({ imageBody = "image-a", email = "customer@example.com" } = {}) {
  const formData = new FormData();
  formData.set("customerName", "홍길동");
  formData.set("email", email);
  formData.set("phone", "010-1234-5678");
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

test("notification migration preserves completed work and locks archived legacy cases", (t) => {
  const database = new D1Database();
  t.after(() => database.close());
  for (const name of migrationNames.slice(0, -1)) {
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
  assert.equal(database.prepare("SELECT COUNT(1) AS count FROM repair_notification_outbox").first().count, 2);

  const conflictingResponse = await submitRepairRequest(createRepairApiContext(env, submissionId, { imageBody: "different-image" }));
  assert.equal(conflictingResponse.status, 409);
  assert.match((await conflictingResponse.json()).error, /다른 접수 내용/);
});

test("submission stores request, event, and rendered outbox atomically", async (t) => {
  const { database, env } = createEnvironment();
  t.after(() => database.close());

  const receipt = await createInitialRepair(env);
  assert.equal(receipt.notificationIds.length, 2);
  assert.equal(database.prepare("SELECT COUNT(1) AS count FROM repair_requests").first().count, 1);
  assert.equal(database.prepare("SELECT COUNT(1) AS count FROM repair_events").first().count, 1);
  assert.equal(database.prepare("SELECT COUNT(1) AS count FROM repair_notification_outbox").first().count, 2);

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
  database.prepare(`
    UPDATE repair_notification_templates
    SET enabled = 0
    WHERE event_type = 'repair.payment_pending' AND audience = 'customer'
  `).run();
  await assert.rejects(
    updateRepairRequest(env, {
      id: "RPR_A",
      expectedVersion: 1,
      status: "payment_pending",
      finalAmount: 30000,
      bankAccount: "테스트은행 123-456",
    }),
    /템플릿/,
  );
  database.prepare(`
    UPDATE repair_notification_templates
    SET enabled = 1
    WHERE event_type = 'repair.payment_pending' AND audience = 'customer'
  `).run();

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
  const sourceNotification = database.prepare(`
    SELECT id FROM repair_notification_outbox
    WHERE repair_request_id = 'RPR_A'
    ORDER BY created_at ASC
    LIMIT 1
  `).first();
  await assert.rejects(
    createManualRepairNotificationResend(env, sourceNotification.id, { type: "admin", id: "test-admin" }),
    /새 안내/,
  );
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

test("outbox classifies success, retryable, unknown, and permanent failures", async (t) => {
  const { database, env } = createEnvironment({
    RESEND_API_KEY: "test-key",
    RESEND_FROM_EMAIL: "Studio OALUM <noreply@example.com>",
  });
  t.after(() => database.close());
  const receipt = await createInitialRepair(env);
  const [sentId, retryId] = receipt.notificationIds;

  let deliveryCalls = 0;
  const sent = await processRepairNotificationOutbox(env, {
    ids: [sentId],
    fetchImpl: async () => {
      deliveryCalls += 1;
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    },
  });
  assert.equal(sent.sent, 1);
  const sentAgain = await processRepairNotificationOutbox(env, {
    ids: [sentId],
    fetchImpl: async () => { throw new Error("sent messages must not run twice"); },
  });
  assert.equal(sentAgain.claimed, 0);
  assert.equal(deliveryCalls, 1);

  const manual = await createManualRepairNotificationResend(env, sentId, { type: "admin", id: "test-admin" });
  const manualSent = await processRepairNotificationOutbox(env, {
    ids: [manual.notificationId],
    fetchImpl: async () => new Response(JSON.stringify({ id: "email_manual" }), { status: 200 }),
  });
  assert.equal(manualSent.sent, 1);
  const manualRow = database.prepare("SELECT event_type, status FROM repair_notification_outbox WHERE id = ?").bind(manual.notificationId).first();
  assert.equal(manualRow.event_type, "repair.manual_resend");
  assert.equal(manualRow.status, "sent");

  const retried = await processRepairNotificationOutbox(env, {
    ids: [retryId],
    fetchImpl: async () => new Response("rate limited", { status: 429 }),
  });
  assert.equal(retried.pending, 1);
  const retryRow = database.prepare("SELECT status, attempt_count, last_error FROM repair_notification_outbox WHERE id = ?").bind(retryId).first();
  assert.equal(retryRow.status, "pending");
  assert.equal(retryRow.attempt_count, 1);

  await createInitialRepair(env, "D");
  const serverErrorId = (await readRepairRequestBySubmissionId(env, "submission:D:1234567890")).notificationIds[0];
  const serverError = await processRepairNotificationOutbox(env, {
    ids: [serverErrorId],
    fetchImpl: async () => new Response("provider unavailable", { status: 500 }),
  });
  assert.equal(serverError.pending, 1);

  await createInitialRepair(env, "E");
  const networkErrorId = (await readRepairRequestBySubmissionId(env, "submission:E:1234567890")).notificationIds[0];
  const networkError = await processRepairNotificationOutbox(env, {
    ids: [networkErrorId],
    fetchImpl: async () => { throw new TypeError("network disconnected"); },
  });
  assert.equal(networkError.pending, 1);

  await createInitialRepair(env, "B");
  const unknownId = (await readRepairRequestBySubmissionId(env, "submission:B:1234567890")).notificationIds[0];
  const unknown = await processRepairNotificationOutbox(env, {
    ids: [unknownId],
    fetchImpl: async () => { throw Object.assign(new Error("timeout"), { name: "AbortError" }); },
  });
  assert.equal(unknown.unknown, 1);
  assert.equal(database.prepare("SELECT status FROM repair_notification_outbox WHERE id = ?").bind(unknownId).first().status, "unknown");

  await createInitialRepair(env, "C");
  const failedId = (await readRepairRequestBySubmissionId(env, "submission:C:1234567890")).notificationIds[0];
  const missingEnv = { ...env, RESEND_API_KEY: "", RESEND_FROM_EMAIL: "" };
  const failed = await processRepairNotificationOutbox(missingEnv, { ids: [failedId] });
  assert.equal(failed.failed, 1);
  assert.match(database.prepare("SELECT last_error FROM repair_notification_outbox WHERE id = ?").bind(failedId).first().last_error, /RESEND_API_KEY/);

  await createInitialRepair(env, "F");
  const deadLetterId = (await readRepairRequestBySubmissionId(env, "submission:F:1234567890")).notificationIds[0];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    database.prepare("UPDATE repair_notification_outbox SET available_at = ? WHERE id = ?").bind("2000-01-01T00:00:00.000Z", deadLetterId).run();
    await processRepairNotificationOutbox(env, {
      ids: [deadLetterId],
      fetchImpl: async () => new Response("provider unavailable", { status: 500 }),
    });
  }
  const deadLetter = database.prepare("SELECT status, attempt_count FROM repair_notification_outbox WHERE id = ?").bind(deadLetterId).first();
  assert.equal(deadLetter.status, "dead_letter");
  assert.equal(deadLetter.attempt_count, 5);
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