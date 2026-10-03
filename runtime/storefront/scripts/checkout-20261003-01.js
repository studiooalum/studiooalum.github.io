/* =========================
   checkout.js — Order summary + form validation + address search
========================= */

import { imageUrl } from "./sanity/image.js";
import { openSitePolicyPanel } from "./components/siteFooter-20261003-01.js";
import { removeFromCart, renderCartPanel, updateQty } from "./cart.js";
import { CART_KEY, ORDER_KEY, readStoredJson, writeStoredJson } from "./utils/storage.js";

const ORDER_CREATE_ENDPOINT = "/api/orders";
const ORDER_QUOTE_ENDPOINT = "/api/orders/quote";
const ACCOUNT_ENDPOINT = "./api/auth/account";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_REDEEMABLE_POINTS = 1000;
const POINT_EARN_RATE = 0.03;
const SHOP_SHIPPING_AMOUNT = 4000;

const checkoutState = {
  isAuthenticated: false,
  availablePoints: 0,
  appliedPoints: 0,
  couponCode: "",
  pricingQuote: null,
  pricingQuoteKey: "",
  pricingQuoteLoading: false,
  pricingQuoteError: "",
};

let pricingQuoteTimer = null;

function formatKoreanPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function formatWon(value) {
  return `${Math.max(0, Math.round(Number(value) || 0)).toLocaleString("ko-KR")}원`;
}

/* =========================
   CART DATA (read-only on this page)
========================= */

function getCart() {
  return readStoredJson(CART_KEY, []);
}

function getCartSubtotal() {
  return getCart().reduce((sum, item) => sum + Math.round(Number(item.price) || 0) * Math.max(1, Number(item.qty) || 1), 0);
}

function normalizePoints(value) {
  const points = Math.floor(Number(value) || 0);
  return Number.isFinite(points) && points > 0 ? points : 0;
}

function normalizeCouponCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-_]/g, "");
}

function calculateExpectedEarnedPoints(amount) {
  return Math.max(0, Math.floor((Math.round(Number(amount) || 0)) * POINT_EARN_RATE));
}

function buildPricingQuoteKey({ couponCode, pointsUsed, email }) {
  return JSON.stringify({
    couponCode: normalizeCouponCode(couponCode),
    pointsUsed: normalizePoints(pointsUsed),
    email: String(email || "").trim().toLowerCase(),
    subtotal: getCartSubtotal(),
  });
}

function getPricingRequestState() {
  const subtotal = getCartSubtotal();
  const pointsUsed = checkoutState.isAuthenticated ? clampAppliedPoints(subtotal) : 0;
  const couponCode = normalizeCouponCode(checkoutState.couponCode);
  const email = syncEmailCompositeField();

  return {
    subtotal,
    pointsUsed,
    couponCode,
    email,
    key: buildPricingQuoteKey({ couponCode, pointsUsed, email }),
  };
}

function schedulePricingQuoteRefresh() {
  if (pricingQuoteTimer) {
    clearTimeout(pricingQuoteTimer);
  }

  pricingQuoteTimer = setTimeout(() => {
    pricingQuoteTimer = null;
    requestPricingQuote();
  }, 350);
}

function getMaxSpendablePoints(subtotal = getCartSubtotal()) {
  if (!checkoutState.isAuthenticated) {
    return 0;
  }

  return Math.max(0, Math.min(Math.trunc(Number(checkoutState.availablePoints) || 0), subtotal));
}

function clampAppliedPoints(subtotal = getCartSubtotal()) {
  const maxSpendable = getMaxSpendablePoints(subtotal);
  const nextApplied = Math.min(normalizePoints(checkoutState.appliedPoints), maxSpendable);

  if (nextApplied > 0 && nextApplied < MIN_REDEEMABLE_POINTS) {
    checkoutState.appliedPoints = 0;
    return 0;
  }

  checkoutState.appliedPoints = nextApplied;
  return checkoutState.appliedPoints;
}

function getCheckoutTotals() {
  const requestState = getPricingRequestState();
  const quote = checkoutState.pricingQuote;

  if (quote && checkoutState.pricingQuoteKey === requestState.key) {
    return {
      subtotal: requestState.subtotal,
      shippingAmount: Math.max(0, Math.round(Number(quote.shippingAmount) || SHOP_SHIPPING_AMOUNT)),
      couponDiscountAmount: Math.max(0, Math.round(Number(quote.couponDiscountAmount) || 0)),
      pointsUsed: Math.max(0, Math.round(Number(quote.pointsUsed) || 0)),
      total: Math.max(0, Math.round(Number(quote.totalAmount) || 0)),
      expectedEarnedPoints: calculateExpectedEarnedPoints(quote.totalAmount),
      couponTitle: String(quote.couponTitle || "").trim(),
      couponCode: String(quote.couponCode || requestState.couponCode || "").trim(),
      couponReservationExpiresAt: String(quote.couponReservationExpiresAt || "").trim(),
      pricingReady: true,
      pricingError: "",
    };
  }

  const subtotal = requestState.subtotal;
  const pointsUsed = requestState.pointsUsed;
  const shippingAmount = subtotal > 0 ? SHOP_SHIPPING_AMOUNT : 0;
  const total = Math.max(0, subtotal + shippingAmount - pointsUsed);

  return {
    subtotal,
    shippingAmount,
    couponDiscountAmount: 0,
    pointsUsed,
    total,
    expectedEarnedPoints: calculateExpectedEarnedPoints(total),
    couponTitle: requestState.couponCode ? checkoutState.pricingQuoteError : "",
    couponCode: requestState.couponCode,
    couponReservationExpiresAt: "",
    pricingReady: false,
    pricingError: checkoutState.pricingQuoteError,
  };
}

function renderPointsSection(totals = getCheckoutTotals()) {
  const section = document.getElementById("checkoutPointsSection");
  const balanceEl = document.getElementById("checkoutPointsBalance");
  const inputEl = document.getElementById("checkoutPointsInput");
  const maxButton = document.getElementById("checkoutPointsMaxBtn");

  if (!section || !balanceEl || !inputEl || !maxButton) {
    return;
  }

  section.hidden = !checkoutState.isAuthenticated;
  if (!checkoutState.isAuthenticated) {
    inputEl.value = "";
    inputEl.disabled = true;
    maxButton.disabled = true;
    return;
  }

  const spendablePoints = getMaxSpendablePoints(totals.subtotal);
  const availablePoints = Math.trunc(Number(checkoutState.availablePoints) || 0);
  const canUsePoints = spendablePoints >= MIN_REDEEMABLE_POINTS;

  balanceEl.textContent = `보유 포인트 ${availablePoints.toLocaleString("ko-KR")}`;
  inputEl.disabled = !canUsePoints;
  inputEl.max = String(spendablePoints);
  inputEl.value = totals.pointsUsed > 0 ? String(totals.pointsUsed) : "";
  maxButton.disabled = !canUsePoints;
}

function renderCouponSection() {
  const inputEl = document.getElementById("checkoutCouponInput");
  const statusEl = document.getElementById("checkoutCouponStatus");
  const totals = getCheckoutTotals();

  if (!inputEl || !statusEl) {
    return;
  }

  inputEl.value = checkoutState.couponCode;

  if (checkoutState.pricingQuoteLoading) {
    statusEl.textContent = "쿠폰 할인 계산 중입니다.";
    return;
  }

  if (totals.pricingError) {
    statusEl.textContent = totals.pricingError;
    return;
  }

  if (!checkoutState.couponCode) {
    statusEl.textContent = "";
    return;
  }

  if (totals.couponDiscountAmount > 0) {
    statusEl.textContent = `${totals.couponCode || checkoutState.couponCode} 적용됨`;
    return;
  }

  statusEl.textContent = `입력된 쿠폰 ${checkoutState.couponCode}`;
}

function applyPointsInput(rawValue) {
  const subtotal = getCartSubtotal();
  const maxSpendable = getMaxSpendablePoints(subtotal);
  let nextApplied = normalizePoints(rawValue);

  if (nextApplied > 0 && nextApplied < MIN_REDEEMABLE_POINTS) {
    nextApplied = 0;
  }

  checkoutState.appliedPoints = Math.min(nextApplied, maxSpendable);
  renderOrderSummary();
}

function resolveCheckoutImageUrl(image) {
  if (!image) return "";
  if (Array.isArray(image)) return resolveCheckoutImageUrl(image[0]);
  if (typeof image === "string") return image;

  try {
    return imageUrl(image, { width: 512 }) || "";
  } catch {
    return typeof image?.asset?.url === "string" ? image.asset.url : "";
  }
}

function generateLocalOrderId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `OALUM-LOCAL-${timestamp}-${random}`.toUpperCase();
}

function buildOrderName(items) {
  if (!items || items.length === 0) return "주문 상품 없음";
  const first = items[0]?.title || "상품";
  if (items.length === 1) return first;
  return `${first} 외 ${items.length - 1}건`;
}

function buildLocalPreviewOrder(orderData) {
  return {
    ...orderData,
    orderId: generateLocalOrderId(),
    orderName: buildOrderName(orderData.items),
    providerMode: "local-preview",
    status: "created",
    paymentStatus: "pending",
  };
}

function hasCheckoutDiscounts(orderData) {
  return normalizePoints(orderData?.pointsUsed) > 0 || normalizeCouponCode(orderData?.couponCode).length > 0;
}

async function createPendingOrder(orderData) {
  let response;

  try {
    response = await fetch(ORDER_CREATE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderData),
    });
  } catch (error) {
    if (hasCheckoutDiscounts(orderData)) {
      throw new Error("쿠폰 또는 포인트 사용 주문은 주문 API 연결이 필요합니다. 잠시 후 다시 시도해주세요.");
    }

    console.warn("Falling back to local pending order preview.", error);
    return buildLocalPreviewOrder(orderData);
  }

  if (response.status === 404 || response.status === 405) {
    if (hasCheckoutDiscounts(orderData)) {
      throw new Error("쿠폰 또는 포인트 사용 주문은 주문 API 연결이 필요합니다. 잠시 후 다시 시도해주세요.");
    }

    console.warn("Order API is unavailable on this host. Falling back to local preview order.");
    return buildLocalPreviewOrder(orderData);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok || !payload?.order) {
    throw new Error(payload?.error || payload?.message || `Order API failed: ${response.status}`);
  }

  return {
    ...orderData,
    ...payload.order,
  };
}

async function requestPricingQuote() {
  const requestState = getPricingRequestState();

  if (!requestState.couponCode && requestState.pointsUsed <= 0) {
    checkoutState.pricingQuote = null;
    checkoutState.pricingQuoteKey = requestState.key;
    checkoutState.pricingQuoteError = "";
    checkoutState.pricingQuoteLoading = false;
    renderOrderSummary();
    return;
  }

  checkoutState.pricingQuoteLoading = true;
  checkoutState.pricingQuoteError = "";
  renderOrderSummary();

  try {
    const response = await fetch(ORDER_QUOTE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: getCart(),
        shippingEmail: requestState.email,
        couponCode: requestState.couponCode,
        pointsUsed: requestState.pointsUsed,
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok || !payload?.quote) {
      throw new Error(payload?.error || payload?.message || `Quote API failed: ${response.status}`);
    }

    checkoutState.pricingQuote = payload.quote;
    checkoutState.pricingQuoteKey = requestState.key;
    checkoutState.pricingQuoteError = "";
  } catch (error) {
    checkoutState.pricingQuote = null;
    checkoutState.pricingQuoteKey = requestState.key;
    checkoutState.pricingQuoteError = error.message || "쿠폰 적용 여부를 확인하지 못했습니다.";
  } finally {
    checkoutState.pricingQuoteLoading = false;
    renderOrderSummary();
  }
}

/* =========================
   RENDER ORDER SUMMARY
========================= */

function renderOrderSummary() {
  const items = getCart();
  const container = document.getElementById("checkoutItems");
  const submitButton = document.getElementById("submitOrderBtn");
  const couponRow = document.getElementById("checkoutCouponDiscountRow");
  const couponDiscount = document.getElementById("checkoutCouponDiscount");
  const pointsRow = document.getElementById("checkoutPointsRow");
  const pointsDiscount = document.getElementById("checkoutPointsDiscount");
  const totals = getCheckoutTotals();

  if (items.length === 0) {
    container.innerHTML = `<p class="checkout-empty">장바구니가 비어있습니다</p>`;
    submitButton.disabled = true;
    document.getElementById("checkoutSubtotal").textContent = formatWon(0);
    document.getElementById("checkoutShipping").textContent = formatWon(0);
    document.getElementById("checkoutTotal").textContent = formatWon(0);
    if (couponRow) {
      couponRow.hidden = false;
      couponDiscount.textContent = formatWon(0);
    }
    if (pointsRow) {
      pointsRow.hidden = false;
      pointsDiscount.textContent = formatWon(0);
    }
    renderCouponSection();
    renderPointsSection({ subtotal: 0, pointsUsed: 0, total: 0, expectedEarnedPoints: 0 });
    return;
  }

  submitButton.disabled = false;

  container.innerHTML = items.map((item) => {
    const imgSrc = resolveCheckoutImageUrl(item.image);
    const editionLabel = item.editionNumber ? ` #${String(item.editionNumber).padStart(2, "0")}` : "";
    return `
      <div class="checkout-item">
        ${imgSrc ? `<img class="checkout-item__img" src="${imgSrc}" alt="${item.title}" />` : '<span class="checkout-item__fallback" aria-hidden="true"></span>'}
        <div class="checkout-item__info">
          <div class="checkout-item__top">
            <div class="checkout-item__title">${item.title}${editionLabel}</div>
            <button type="button" class="checkout-item__remove" data-checkout-remove="${item.lineId || item._id}" aria-label="삭제">×</button>
          </div>
          <div class="checkout-item__meta">${formatWon(item.price)}</div>
          <div class="checkout-item__controls">
            <div class="checkout-item__qty">
              <button type="button" class="checkout-item__qty-btn" data-checkout-qty="dec" data-id="${item.lineId || item._id}">−</button>
              <span class="checkout-item__qty-value">${item.qty}</span>
              <button type="button" class="checkout-item__qty-btn" data-checkout-qty="inc" data-id="${item.lineId || item._id}">+</button>
            </div>
          </div>
        </div>
        <div class="checkout-item__subtotal">${formatWon(item.price * item.qty)}</div>
      </div>
    `;
  }).join("");

  document.getElementById("checkoutSubtotal").textContent = formatWon(totals.subtotal);
  document.getElementById("checkoutShipping").textContent = formatWon(totals.shippingAmount);
  document.getElementById("checkoutTotal").textContent = formatWon(totals.total);

  if (couponRow && couponDiscount) {
    couponRow.hidden = false;
    couponDiscount.textContent = totals.couponDiscountAmount > 0
      ? `-${formatWon(totals.couponDiscountAmount)}`
      : formatWon(0);
  }

  if (pointsRow && pointsDiscount) {
    pointsRow.hidden = false;
    pointsDiscount.textContent = totals.pointsUsed > 0
      ? `-${formatWon(totals.pointsUsed)}`
      : formatWon(0);
  }

  renderCouponSection();
  renderPointsSection(totals);
}

function setupSummaryControls() {
  const container = document.getElementById("checkoutItems");

  container.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-checkout-remove]");
    if (removeButton) {
      removeFromCart(removeButton.getAttribute("data-checkout-remove"));
      renderOrderSummary();
      renderCartPanel();
      schedulePricingQuoteRefresh();
      return;
    }

    const qtyButton = event.target.closest("[data-checkout-qty]");
    if (!qtyButton) return;

    const itemId = qtyButton.getAttribute("data-id");
    const delta = qtyButton.getAttribute("data-checkout-qty") === "inc" ? 1 : -1;
    updateQty(itemId, delta);
    renderOrderSummary();
    renderCartPanel();
    schedulePricingQuoteRefresh();
  });
}

/* =========================
   DAUM POSTCODE (Korean address search)
========================= */

function openAddressSearch() {
  new daum.Postcode({
    oncomplete(data) {
      document.getElementById("zipcode").value = data.zonecode;
      document.getElementById("address1").value = data.roadAddress || data.jibunAddress;
      document.getElementById("address2").focus();
    },
  }).open();
}

function getEmailFieldElements() {
  return {
    localInput: document.getElementById("emailLocal"),
    domainSelect: document.getElementById("emailDomainSelect"),
    customDomainInput: document.getElementById("emailDomainCustom"),
    emailInput: document.getElementById("email"),
  };
}

function syncEmailCompositeField() {
  const {
    localInput,
    domainSelect,
    customDomainInput,
    emailInput,
  } = getEmailFieldElements();

  if (!localInput || !domainSelect || !customDomainInput) {
    return String(emailInput?.value || "").trim();
  }

  const localPart = String(localInput.value || "").trim();
  const selectedDomain = String(domainSelect.value || "").trim();
  const domain = selectedDomain === "custom"
    ? String(customDomainInput.value || "").trim()
    : selectedDomain;
  const email = localPart && domain ? `${localPart}@${domain}` : "";

  customDomainInput.hidden = selectedDomain !== "custom";
  if (selectedDomain !== "custom") {
    customDomainInput.value = "";
  }

  emailInput.value = email;
  return email;
}

function applyEmailCompositeValue(email) {
  const {
    localInput,
    domainSelect,
    customDomainInput,
    emailInput,
  } = getEmailFieldElements();

  if (!emailInput) {
    return;
  }

  if (!localInput || !domainSelect || !customDomainInput) {
    emailInput.value = String(email || "").trim();
    return;
  }

  const normalized = String(email || "").trim();
  if (!normalized.includes("@")) {
    localInput.value = normalized;
    domainSelect.value = "";
    customDomainInput.value = "";
    emailInput.value = "";
    customDomainInput.hidden = true;
    return;
  }

  const atIndex = normalized.indexOf("@");
  const localPart = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  const optionExists = Array.from(domainSelect.options).some((option) => option.value === domain);

  localInput.value = localPart;
  if (optionExists) {
    domainSelect.value = domain;
    customDomainInput.value = "";
  } else {
    domainSelect.value = "custom";
    customDomainInput.value = domain;
  }

  customDomainInput.hidden = domainSelect.value !== "custom";
  emailInput.value = normalized;
}

function setupEmailField() {
  const {
    localInput,
    domainSelect,
    customDomainInput,
  } = getEmailFieldElements();

  if (!localInput || !domainSelect || !customDomainInput) {
    const emailInput = document.getElementById("email");
    emailInput?.addEventListener("input", schedulePricingQuoteRefresh);
    return;
  }

  const handleSync = () => {
    syncEmailCompositeField();
    if (!customDomainInput.hidden && !customDomainInput.value.trim()) {
      customDomainInput.focus();
    }
    schedulePricingQuoteRefresh();
  };

  localInput.addEventListener("input", handleSync);
  domainSelect.addEventListener("change", handleSync);
  customDomainInput.addEventListener("input", handleSync);

  syncEmailCompositeField();
}

function setupPolicyLinks() {
  document.querySelectorAll("[data-checkout-policy]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openSitePolicyPanel(button.dataset.checkoutPolicy, button);
    });
  });
}

function setCheckoutAuthState({ authenticated, message, detail }) {
  const headlineEl = document.getElementById("checkoutAuthHeadline");
  const copyEl = document.getElementById("checkoutAuthCopy");
  const linkEl = document.getElementById("checkoutAuthLink");
  const saveFieldEl = document.getElementById("checkoutSaveAddressField");

  if (!headlineEl || !copyEl || !linkEl || !saveFieldEl) {
    return;
  }

  headlineEl.textContent = message;
  copyEl.textContent = detail;
  saveFieldEl.hidden = !authenticated;

  if (authenticated) {
    linkEl.textContent = "계정 보기";
  } else {
    linkEl.textContent = "로그인 / 회원가입";
  }

  checkoutState.isAuthenticated = authenticated;
  if (!authenticated) {
    checkoutState.availablePoints = 0;
    checkoutState.appliedPoints = 0;
  }

  renderOrderSummary();
}

function fillShippingForm(user) {
  const form = document.getElementById("checkoutForm");
  if (!form || !user) return;

  if (user.fullName && !form.name.value.trim()) {
    form.name.value = user.fullName;
  }

  if (user.phone && !form.phone.value.trim()) {
    form.phone.value = formatKoreanPhone(user.phone);
  }

  if (user.email && !form.email.value.trim()) {
    applyEmailCompositeValue(user.email);
  }

  if (user.zipcode && !form.zipcode.value.trim()) {
    form.zipcode.value = user.zipcode;
  }

  if (user.address1 && !form.address1.value.trim()) {
    form.address1.value = user.address1;
  }

  if (user.address2 && !form.address2.value.trim()) {
    form.address2.value = user.address2;
  }
}

async function loadCheckoutAccount() {
  try {
    const response = await fetch(ACCOUNT_ENDPOINT, {
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) {
        throw Object.assign(new Error("guest"), { status: 401 });
      }
      throw new Error(payload?.error || `Account API failed: ${response.status}`);
    }

    fillShippingForm(payload?.account?.user || null);
    checkoutState.availablePoints = Math.trunc(Number(payload?.account?.user?.pointsBalance) || 0);
    setCheckoutAuthState({
      authenticated: true,
      message: "회원 주문으로 진행 중입니다.",
      detail: "저장된 기본 주소를 불러왔습니다. 필요하면 수정 후 결제해주세요.",
    });
    schedulePricingQuoteRefresh();
  } catch (error) {
    if (error?.status === 401 || error?.message === "guest") {
      setCheckoutAuthState({
        authenticated: false,
        message: "비회원 주문이 가능합니다.",
        detail: "로그인하면 기본 주소와 주문 내역을 계정에 연결할 수 있습니다.",
      });
      return;
    }

    console.error("Failed to load checkout account.", error);
    setCheckoutAuthState({
      authenticated: false,
      message: "비회원 주문이 가능합니다.",
      detail: "계정 정보를 불러오지 못해도 비회원 주문은 계속 진행할 수 있습니다.",
    });
    schedulePricingQuoteRefresh();
  }
}

/* =========================
   DELIVERY MEMO — custom input toggle
========================= */

function setupMemo() {
  const memoSelect = document.getElementById("memo");
  const memoCustom = document.getElementById("memoCustom");

  memoSelect.addEventListener("change", () => {
    if (memoSelect.value === "custom") {
      memoCustom.style.display = "";
      memoCustom.focus();
    } else {
      memoCustom.style.display = "none";
      memoCustom.value = "";
    }
  });
}

function setupPointsField() {
  const inputEl = document.getElementById("checkoutPointsInput");
  const maxButton = document.getElementById("checkoutPointsMaxBtn");

  if (!inputEl || !maxButton) {
    return;
  }

  inputEl.addEventListener("input", () => {
    applyPointsInput(inputEl.value);
    schedulePricingQuoteRefresh();
  });

  maxButton.addEventListener("click", () => {
    const subtotal = getCartSubtotal();
    const maxSpendable = getMaxSpendablePoints(subtotal);
    const nextApplied = maxSpendable >= MIN_REDEEMABLE_POINTS ? maxSpendable : 0;
    checkoutState.appliedPoints = nextApplied;
    renderOrderSummary();
    schedulePricingQuoteRefresh();
  });
}

function setupCouponField() {
  const inputEl = document.getElementById("checkoutCouponInput");
  const clearButton = document.getElementById("checkoutCouponClearBtn");

  if (!inputEl || !clearButton) {
    return;
  }

  inputEl.addEventListener("input", () => {
    checkoutState.couponCode = normalizeCouponCode(inputEl.value);
    renderCouponSection();
    schedulePricingQuoteRefresh();
  });

  inputEl.addEventListener("blur", () => {
    checkoutState.couponCode = normalizeCouponCode(inputEl.value);
    renderCouponSection();
    schedulePricingQuoteRefresh();
  });

  clearButton.addEventListener("click", () => {
    checkoutState.couponCode = "";
    renderCouponSection();
    schedulePricingQuoteRefresh();
  });

  renderCouponSection();
}

/* =========================
   FORM VALIDATION + SUBMIT
========================= */

function setupForm() {
  const form = document.getElementById("checkoutForm");

  const validateForm = ({ focusFirst = false } = {}) => {
    const email = syncEmailCompositeField().trim();
    const memoValue = form.memo.value === "custom" ? form.memoCustom.value.trim() : form.memo.value;
    const checks = [
      { control: form.name, valid: Boolean(form.name.value.trim()) },
      { control: form.phone, valid: /^010-\d{4}-\d{4}$/.test(form.phone.value.trim()) },
      { control: form.email, valid: EMAIL_REGEX.test(email) },
      { control: form.zipcode, valid: Boolean(form.zipcode.value.trim()), focusTarget: document.getElementById("searchZipBtn") },
      { control: form.address1, valid: Boolean(form.address1.value.trim()), focusTarget: document.getElementById("searchZipBtn") },
      { control: form.address2, valid: Boolean(form.address2.value.trim()) },
      { control: form.memo.value === "custom" ? form.memoCustom : form.memo, valid: Boolean(memoValue) },
      { control: form.querySelector("#agreeTermsPrivacy"), valid: form.querySelector("#agreeTermsPrivacy")?.checked === true },
    ];

    for (const check of checks) {
      const field = check.control?.closest(".checkout-field, .checkout-agree__item");
      field?.classList.toggle("is-invalid", !check.valid);
      check.control?.setAttribute("aria-invalid", String(!check.valid));
    }
    form.classList.toggle("is-validation-visible", checks.some((check) => !check.valid));

    const firstInvalid = checks.find((check) => !check.valid);
    if (focusFirst && firstInvalid) {
      const target = firstInvalid.focusTarget || firstInvalid.control;
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    }
    return !firstInvalid;
  };

  form.phone.addEventListener("input", () => {
    form.phone.value = formatKoreanPhone(form.phone.value);
  });
  form.addEventListener("input", () => {
    if (form.classList.contains("is-validation-visible")) validateForm();
  });
  form.addEventListener("change", () => {
    if (form.classList.contains("is-validation-visible")) validateForm();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!validateForm({ focusFirst: true })) return;

    // Basic client-side validation
    const name = form.name.value.trim();
    const phone = form.phone.value.trim();
    const email = syncEmailCompositeField().trim();
    const zipcode = form.zipcode.value.trim();
    const address1 = form.address1.value.trim();
    const address2 = form.address2.value.trim();
    const memo = form.memo.value === "custom" ? form.memoCustom.value.trim() : form.memo.value;
    const saveAsDefaultAddress = form.saveAsDefaultAddress?.checked === true;
    if (checkoutState.couponCode || checkoutState.appliedPoints > 0) {
      await requestPricingQuote();
    }
    const totals = getCheckoutTotals();

    if (checkoutState.pricingQuoteLoading) {
      alert("쿠폰 적용 금액을 확인하는 중입니다. 잠시만 기다려주세요.");
      return;
    }

    if (checkoutState.couponCode && !totals.couponDiscountAmount && checkoutState.pricingQuoteError) {
      alert("쿠폰 적용이 실패했습니다. 코드를 다시 확인해주세요.");
      return;
    }

    const orderData = {
      items: getCart(),
      shipping: { name, phone, email, zipcode, address1, address2, memo },
      saveAsDefaultAddress,
      couponCode: checkoutState.couponCode,
      pointsUsed: totals.pointsUsed,
      shippingAmount: totals.shippingAmount,
      total: totals.total,
      createdAt: new Date().toISOString(),
    };

    try {
      const pendingOrder = await createPendingOrder(orderData);

      // Save order for the payment page to read
      writeStoredJson(ORDER_KEY, pendingOrder);

      // Redirect to Toss payment page
      window.location.href = "./payment.html";
    } catch (error) {
      console.error("Order creation error:", error);
      alert(error.message || "주문 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  });
}

/* =========================
   INIT
========================= */

renderOrderSummary();
setupEmailField();
setupCouponField();
setupPointsField();
setupSummaryControls();
setupMemo();
setupPolicyLinks();
setupForm();
loadCheckoutAccount();

schedulePricingQuoteRefresh();

document.getElementById("searchZipBtn").addEventListener("click", openAddressSearch);
