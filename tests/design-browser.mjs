import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error("Set PLAYWRIGHT_MODULE to an installed Playwright index.mjs.");
const { chromium } = await import(pathToFileURL(modulePath).href);
const base = process.env.TEST_SITE_URL || "http://localhost:8788";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error("Browser mutation checks are local-only.");
const output = "test-results/design-20260924";
await mkdir(output, { recursive: true });

async function request(path, body) {
  const response = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  assert.ok(response.ok && payload.ok, `${path}: ${response.status} ${payload.error || ""}`);
  return { response, payload };
}

const email = `design-${Date.now()}@example.com`;
const code = (await request("/api/auth/request", { mode: "signup", email, fullName: "디자인 검증" })).payload.debugCode;
const signup = await request("/api/auth/signup", {
  fullName: "디자인 검증", email, code, password: "fixture-password", privacyConsent: true, termsConsent: true,
});
const setCookie = signup.response.headers.get("set-cookie") || "";
const sessionValue = /oalum_session=([^;]+)/.exec(setCookie)?.[1];
assert.ok(sessionValue, "signup session cookie missing");

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const errors = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    await context.addCookies([{ name: "oalum_session", value: decodeURIComponent(sessionValue), url: base }]);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    const label = viewport.width >= 960 ? "desktop" : "mobile";
    const product = {
      _id: "fixture-product", title: "OALUM Bag (No. 01)", description: "오래 사용할 수 있도록 만든 가방입니다.",
      price: 68000, discountRate: 0, soldOut: false, slug: { current: "fixture-product" }, category: "bag", shopTags: ["bag"], images: [],
    };
    await page.route("**/api/sanity/query", async (route) => {
      const payload = route.request().postDataJSON();
      const query = payload?.query || "";
      await route.fulfill({ json: { ok: true, result: query.includes("slug.current == $slug") ? product : [product] } });
    });

    async function shot(name) {
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${name}-${label} overflow`);
      await page.screenshot({ path: `${output}/${name}-${label}.png`, fullPage: true });
    }

    await page.goto(`${base}/product?product=OALUM%20Bag`);
    await page.locator("#productTitle").filter({ hasText: "OALUM Bag" }).waitFor();
    const productLayout = await page.evaluate(() => {
      const selectors = ["#productTitle", "#productIntro", "#productMeta"];
      return selectors.map((selector) => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width, fontSize: getComputedStyle(document.querySelector(selector)).fontSize };
      });
    });
    if (label === "desktop") {
      assert.ok(productLayout.every((item) => Math.abs(item.left - productLayout[0].left) <= 1), "product copy must share column one");
      assert.ok(productLayout.every((item) => Math.abs(item.width - productLayout[0].width) <= 1), "product copy must match the first-column width");
      assert.ok(productLayout[0].top < productLayout[1].top && productLayout[1].top < productLayout[2].top, "product copy must remain vertically stacked");
    }
    await shot("product-grid");

    await page.goto(`${base}/shop`);
    await page.locator(".shop-card__title").waitFor();
    const shopType = await page.evaluate(() => ({
      title: getComputedStyle(document.querySelector(".shop-card__title")).fontSize,
      meta: getComputedStyle(document.querySelector(".shop-card__meta")).fontSize,
    }));
    assert.deepEqual(shopType, { title: "16px", meta: "16px" });
    await shot("shop-type");

    await page.goto(`${base}/edition?slug=fixture-product`);
    await page.locator("#addToCartBtn").waitFor();
    const actionButtons = await page.locator(".edition-actions .edition-btn").evaluateAll((buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    }));
    assert.equal(actionButtons.length, 2);
    assert.ok(actionButtons.every((button) => button.height >= 46));
    assert.ok(actionButtons[1].top >= actionButtons[0].top + actionButtons[0].height, "two command buttons must stack vertically");
    assert.ok(Math.abs(actionButtons[0].width - actionButtons[1].width) <= 1);
    await page.locator(".edition-actions .edition-btn").first().hover();
    const actionHoverOutline = await page.locator(".edition-actions .edition-btn").first().evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: style.outlineWidth };
    });
    assert.deepEqual(actionHoverOutline, { style: "none", width: "0px" });
    assert.equal(await page.locator(".edition-recommendation__title").innerText(), "you may also like");
    assert.equal(await page.locator(".edition-recommendation__title").evaluate((element) => getComputedStyle(element).fontSize), "16px");
    await shot("edition-actions");

    await page.goto(`${base}/repair`);
    await page.locator("#repairApplyBtn").waitFor();
    const repairType = await page.evaluate(() => ({
      title: getComputedStyle(document.querySelector("#repair-title")).fontSize,
      body: getComputedStyle(document.querySelector(".repair-body-copy p")).fontSize,
      buttonHeight: document.querySelector("#repairApplyBtn").getBoundingClientRect().height,
    }));
    assert.equal(repairType.title, label === "desktop" ? "34px" : "28px");
    assert.equal(repairType.body, "16px");
    assert.ok(repairType.buttonHeight >= 46);
    await shot("repair-studio");
    await page.locator("#repairApplyBtn").click();
    const requestNote = page.locator('textarea[name="budgetNote"]');
    await requestNote.waitFor();
    assert.equal(await requestNote.getAttribute("placeholder"), "의뢰하신 의류의 수선 전후 이미지를 작업 아카이브나 SNS에 사용할 수 있습니다. 원치 않으시면 기타 요청사항에 미리 말씀해 주세요.");
    assert.equal(await page.locator('[name="archiveConsentChoice"]').count(), 0);
    await shot("repair-request");

    await page.goto(`${base}/account`);
    await page.locator(".js-account-member-layout:not([hidden])").waitFor();
    assert.equal(await page.locator(".account-overview__title, .account-overview__kicker").count(), 0);
    assert.equal(await page.locator(".js-account-overview-phone").innerText(), "-");
    assert.equal(await page.locator(".js-account-overview-address").innerText(), "-");
    const accountPresentation = await page.evaluate(() => {
      const avatar = document.querySelector(".account-overview__avatar").getBoundingClientRect();
      const avatarVisual = document.querySelector(".js-account-avatar-image:not([hidden]), .js-account-avatar:not([hidden])").getBoundingClientRect();
      const links = [...document.querySelectorAll(".account-overview__link")].map((element) => {
        const style = getComputedStyle(element);
        return { decoration: style.textDecorationLine, background: style.backgroundColor, border: style.borderTopWidth };
      });
      const cardColor = (selector) => getComputedStyle(document.querySelector(selector)).backgroundColor;
      return {
        avatarCenter: { x: avatar.left + avatar.width / 2, y: avatar.top + avatar.height / 2 },
        visualCenter: { x: avatarVisual.left + avatarVisual.width / 2, y: avatarVisual.top + avatarVisual.height / 2 },
        links,
        colors: {
          orders: cardColor(".account-dashboard-card--orders"),
          classes: cardColor(".account-dashboard-card--classes"),
          points: cardColor(".account-dashboard-card--points"),
        },
      };
    });
    assert.ok(Math.abs(accountPresentation.avatarCenter.x - accountPresentation.visualCenter.x) <= 1);
    assert.ok(Math.abs(accountPresentation.avatarCenter.y - accountPresentation.visualCenter.y) <= 1);
    assert.ok(accountPresentation.links.every((link) => link.decoration.includes("underline") && link.background === "rgba(0, 0, 0, 0)" && link.border === "0px"));
    assert.deepEqual(accountPresentation.colors, {
      orders: "rgb(227, 66, 52)",
      classes: "rgb(255, 231, 77)",
      points: "rgb(201, 211, 214)",
    });
    await page.locator(".js-account-avatar-button").click();
    await page.locator(".js-account-avatar-input").setInputFiles({ name: "profile.webp", mimeType: "image/webp", buffer: Buffer.from("profile-browser-image") });
    await page.locator(".js-account-avatar-image:not([hidden])").waitFor();
    await page.evaluate(() => { window.accountDocumentMarker = crypto.randomUUID(); });
    const marker = await page.evaluate(() => window.accountDocumentMarker);
    await page.locator('[data-account-view-link="repairs"]').click();
    await page.locator('[data-account-detail="repairs"]').waitFor();
    assert.equal(await page.evaluate(() => window.accountDocumentMarker), marker, "account subview navigation must not reload the document");
    assert.match(page.url(), /view=repairs/);
    const overviewDisplay = await page.locator(".account-overview").evaluate((element) => getComputedStyle(element).display);
    assert.equal(overviewDisplay, label === "mobile" ? "none" : "block");
    await page.locator(".account-detail-back").click();
    assert.equal(await page.evaluate(() => window.accountDocumentMarker), marker, "account return must not reload the document");
    await shot("account-dashboard");

    await page.goto(`${base}/newsletter`);
    await page.locator(".newsletter-main").waitFor();
    assert.equal(await page.locator('link[href*="layout.css?v=20260520-02"]').count(), 1);
    await shot("newsletter-restored");
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, screenshots: output }, null, 2));
} finally {
  await browser.close();
}