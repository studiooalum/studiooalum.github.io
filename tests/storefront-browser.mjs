import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error("Set PLAYWRIGHT_MODULE to an installed Playwright index.mjs.");
const { chromium } = await import(pathToFileURL(modulePath).href);
const base = process.env.TEST_SITE_URL || "http://localhost:8788";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error("Browser mutation checks are local-only.");
const output = "test-results/release-20260924";
await mkdir(output, { recursive: true });

async function api(path, body, token = "") {
  const response = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  assert.ok(response.ok && payload.ok, `${path}: ${response.status} ${payload.error || ""}`);
  return payload;
}

const session = await api("/api/orders/admin-session", { adminSecret: "local-browser-check" });
const previous = await api("/api/workshops/admin", null, session.accessToken);
for (const reservation of previous.reservations.filter((item) => item.workshopSlug.startsWith("browser-") && item.status === "waiting_for_payment")) {
  await api("/api/workshops/admin", { action: "cancelReservation", reservationId: reservation.reservationId }, session.accessToken);
}
const imageUrl = "https://studiooalum.com/oalum-logo.png";
const daily = {
  slug: "browser-daily", title: "원데이 바느질", category: "공예", description: "천천히 손으로 바느질하는 시간입니다. 일상에서 쓰는 물건을 함께 만들고 오래 사용하는 방법을 배웁니다.",
  summary: "함께 만드는 바느질 수업", status: "published", posterImageUrl: imageUrl,
  locationName: "오알룸 작업실", locationAddress: "서울특별시 동대문구 이문로42길 5", maxCapacity: 4, price: 50000,
  bookingConfig: { workshopType: "daily", fixedPrice: 50000, attendeePrices: { 1: 50000, 2: 90000, 3: 130000, 4: 160000 },
    dailyCapacity: 4, maxParticipants: 4, minParticipants: 1, maxBookingMonths: 3,
    dailyTimeSlots: [{ startTime: "10:00", endTime: "13:00" }, { startTime: "14:00", endTime: "17:00" }] },
  scheduleSlots: [],
};
const course = { ...daily, slug: "browser-course", title: "오알룸 바느질 과정", price: 90000, maxCapacity: 8,
  bookingConfig: { workshopType: "event", fixedPrice: 90000, maxParticipants: 8, minParticipants: 2 },
  scheduleSlots: [{ _key: "browser-course-1", date: "2099-11-01", startTime: "10:00", endTime: "13:00", capacity: 8 }, { _key: "browser-course-2", date: "2099-11-08", startTime: "10:00", endTime: "13:00", capacity: 8 }],
};
await api("/api/workshops/admin", { action: "saveWorkshopContent", workshop: daily }, session.accessToken);
await api("/api/workshops/admin", { action: "saveWorkshopContent", workshop: course }, session.accessToken);
await api("/api/workshops/admin", { action: "saveCustomWorkshopImage", imageUrl, imageAlt: "맞춤 워크샵" }, session.accessToken);

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const errors = [];
const reports = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
    await context.addInitScript(({ token, expiresAt }) => {
      sessionStorage.setItem("studiooalum:order-admin-access-token", token);
      sessionStorage.setItem("studiooalum:order-admin-access-expires-at", expiresAt);
    }, { token: session.accessToken, expiresAt: session.expiresAt });
    const page = await context.newPage();
    let latestReservation = null;
    await page.route("**/api/workshops/reservations", async (route) => {
      const response = await route.fetch();
      latestReservation = await response.json();
      await route.fulfill({ response, json: latestReservation });
    });
    page.on("pageerror", (error) => errors.push(error.message));
    const label = viewport.width > 960 ? "desktop" : "mobile";
    async function screenshot(name) {
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      assert.equal(overflow, false, `${name} ${label} horizontal overflow`);
      await page.screenshot({ path: `${output}/${name}-${label}.png`, fullPage: true });
      reports.push(`${name}-${label}`);
    }

    await page.goto(`${base}/workshop?slug=browser-daily`);
    await page.locator("#workshopTitle").filter({ hasText: daily.title }).waitFor();
    const viewportWidthBeforeBooking = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, bodyWidth: document.body.getBoundingClientRect().width }));
    await page.locator("#workshopApplyBtn").click();
    await page.locator(".workshop-slot-btn").first().waitFor();
    await page.waitForTimeout(400);
    const bookingPanelLayout = await page.evaluate(() => {
      const panel = document.getElementById("workshopRailPanel").getBoundingClientRect();
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;left:var(--page-third-start);width:1px;height:1px;visibility:hidden";
      document.body.appendChild(probe);
      const thirdStart = probe.getBoundingClientRect().left;
      probe.remove();
      return {
        clientWidth: document.documentElement.clientWidth,
        bodyWidth: document.body.getBoundingClientRect().width,
        panelLeft: panel.left,
        panelRight: panel.right,
        thirdStart,
      };
    });
    assert.deepEqual({ clientWidth: bookingPanelLayout.clientWidth, bodyWidth: bookingPanelLayout.bodyWidth }, viewportWidthBeforeBooking);
    if (label === "desktop") {
      assert.ok(Math.abs(bookingPanelLayout.panelLeft - bookingPanelLayout.thirdStart) <= 2, "booking panel must start at column three");
      assert.ok(bookingPanelLayout.panelRight <= viewport.width && viewport.width - bookingPanelLayout.panelRight <= 20, "booking panel must meet the browser scrollbar");
    }
    assert.equal(await page.locator("#bookingAllowAdditionalAttendees").count(), 0);
    await page.locator(".workshop-slot-btn").last().click();
    await page.locator("#bookingAttendeeCount").selectOption("2");
    assert.match(await page.locator("#workshopBookingPrice").innerText(), /90,000/);
    await page.locator("#bookingName").fill("브라우저 검증");
    await page.locator("#bookingEmail").fill(`browser-${label}-${Date.now()}@example.com`);
    await page.locator("#bookingPhone").fill("01012345678");
    await screenshot("one-day-form");
    await page.locator("#workshopBookingSubmit").click();
    await page.waitForURL("**/workshop-payment?checkoutId=*");
    const reservation = latestReservation;
    assert.equal(reservation.ok, true);
    assert.equal(reservation.reservation.slotStartTime, "14:00");
    assert.equal(reservation.reservation.amountDue, 90000);
    assert.equal(reservation.reservation.joinPolicy, "private");
    await api("/api/workshops/admin", { action: "cancelReservation", reservationId: reservation.reservation.reservationId }, session.accessToken);

    await page.goto(`${base}/workshop?slug=browser-course`);
    await page.locator("#workshopTitle").filter({ hasText: course.title }).waitFor();
    await page.locator("#workshopApplyBtn").click();
    await page.locator("#bookingAttendeeCount").selectOption("2");
    assert.match(await page.locator("#workshopBookingPrice").innerText(), /180,000/);
    assert.equal(await page.locator("#workshopSlotList .workshop-schedule-item").count(), 2);
    await screenshot("course-form");

    await page.goto(`${base}/workshops`);
    await page.getByRole("heading", { name: "맞춤 워크샵", exact: true }).click();
    const form = page.locator("#customWorkshopForm");
    await form.locator('[name="fullName"]').fill("맞춤 문의 검증");
    await form.locator('[name="phone"]').fill("01012345678");
    await form.locator('[name="email"]').fill("custom-browser@example.com");
    await form.locator('[name="attendeeCount"]').fill("12");
    await form.locator('[name="preferredSchedule"]').fill("2099년 12월 1일 오후");
    await form.locator('[name="locationType"]').selectOption("other");
    await form.locator('[name="locationDetail"]').fill("서울 교육 공간");
    await form.locator('[name="classContent"]').fill("기초 바느질");
    await form.locator('[name="privacyConsent"]').check();
    await screenshot("custom-form");
    await form.locator('[type="submit"]').click();
    await page.locator("#customWorkshopFeedback").filter({ hasText: "문의가 접수되었습니다" }).waitFor();

    await page.goto(`${base}/workshop-admin.html#inquiries`);
    await page.locator("#workshopInquiryList .workshop-inquiry-row").first().waitFor();
    await screenshot("workshop-admin-inquiries");
    const row = page.locator("#workshopInquiryList .workshop-inquiry-row").first();
    await row.locator('[name="inquiryStatus"]').selectOption("contacted");
    await row.locator('[name="inquiryAdminNote"]').fill("검증 완료");
    const saved = page.waitForResponse((response) => response.url().endsWith("/api/workshops/admin") && response.request().method() === "POST");
    await row.locator("[data-save-inquiry]").click();
    assert.equal((await (await saved).json()).ok, true);
    await page.locator('[data-mode="workshops"]').click();
    await page.locator('[name="workshopType"]').waitFor();
    await screenshot("workshop-admin-editor");

    const ticket = { id: "RPT_BROWSER", repairId: "RPR_BROWSER", status: "open", createdAt: "2026-09-24T00:00:00Z",
      repair: { requestNumber: "REP-BROWSER", ticketNumber: 7, customerName: "브라우저 검증", itemType: "자켓",
        issueDescription: "소매와 안감의 닳은 부분을 수선해주세요. 오래 입은 자켓의 형태를 유지하고 싶습니다.",
        status: "payment_pending", statusLabel: "수선 완료 · 결제 대기", quoteAmount: 45000, finalAmount: 55000,
        onlinePaymentAvailable: true, paymentStatus: "unpaid", createdAt: "2026-09-24T00:00:00Z", updatedAt: "2026-09-24T09:00:00Z",
        requestImages: [{ filename: "수선 사진", streamPath: "/oalum-logo.png" }] },
      messages: [{ authorType: "system", body: "수선 작업이 완료되었습니다. 최종 금액과 결제 안내를 확인해주세요.", createdAt: "2026-09-24T00:00:00Z" },
        { authorType: "admin", body: "소매와 안감의 수선을 마쳤습니다. 기존 원단과 어울리는 실로 보강했습니다. 확인 후 편하게 말씀해주세요.", createdAt: "2026-09-24T01:00:00Z" },
        { authorType: "customer", body: "확인했습니다. 감사합니다. 결제 후 발송 부탁드립니다.", createdAt: "2026-09-24T02:00:00Z" }] };
    await page.route("**/api/repairs/tickets/RPT_BROWSER", (route) => route.fulfill({ json: { ok: true, viewerType: "customer", ticket } }));
    await page.route("**/api/repairs/payment", (route) => route.fulfill({ json: { ok: true, checkout: { orderId: "RPO_BROWSER", amount: 55000, currency: "KRW", clientKey: "test_gck_fixture", orderName: "수선 결제", customer: { name: "검증", email: "test@example.com" }, paymentVariantKey: "DEFAULT", agreementVariantKey: "AGREEMENT" } } }));
    await page.route("https://js.tosspayments.com/**", (route) => route.fulfill({ contentType: "application/javascript", body: `window.TossPayments=Object.assign(function(){return {widgets(){return {setAmount:async(value)=>{window.testPaymentAmount=value},renderPaymentMethods:async()=>{},renderAgreement:async()=>{},requestPayment:async(value)=>{window.testPaymentRequest=value}}}}},{ANONYMOUS:'anonymous'});` }));
    await page.goto(`${base}/repair-ticket?ticket=RPT_BROWSER`);
    await page.locator("#repairTicketPayButton").waitFor();
    await screenshot("repair-ticket");
    await page.locator("#repairTicketPayButton").click();
    await page.locator("#repairPaymentConfirm:not([disabled])").waitFor();
    await page.locator("#repairPaymentConfirm").click();
    const payment = await page.evaluate(() => ({ amount: window.testPaymentAmount, request: window.testPaymentRequest }));
    assert.equal(payment.amount.value, 55000);
    assert.equal(new URL(payment.request.successUrl).searchParams.get("ticket"), "RPT_BROWSER");
    assert.equal(new URL(payment.request.successUrl).searchParams.has("access"), false);
    await screenshot("repair-payment");
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: reports, screenshots: output }, null, 2));
} finally { await browser.close(); }