const ADMIN_ACCESS_TOKEN_KEY = "studiooalum:order-admin-access-token";
const ADMIN_ACCESS_EXPIRES_AT_KEY = "studiooalum:order-admin-access-expires-at";

const authForm = document.querySelector(".js-fulfillment-auth-form");
const authClearButton = document.querySelector(".js-fulfillment-auth-clear");
const authStatusEl = document.querySelector(".js-fulfillment-auth-status");
const authGuardEls = Array.from(document.querySelectorAll("[data-fulfillment-auth-guard]"));
const accessBadgeEl = document.querySelector(".js-fulfillment-access-badge");
const accessCopyEl = document.querySelector(".js-fulfillment-access-copy");
const accessMetaEl = document.querySelector(".js-fulfillment-access-meta");
const searchInput = document.querySelector(".js-fulfillment-search-input");
const searchButton = document.querySelector(".js-fulfillment-search-btn");
const refreshButton = document.querySelector(".js-fulfillment-refresh-btn");
const listStatusEl = document.querySelector(".js-fulfillment-list-status");
const orderListEl = document.querySelector(".js-fulfillment-order-list");
const selectionEl = document.querySelector(".js-fulfillment-selection");
const formEl = document.querySelector(".js-fulfillment-form");
const formStatusEl = document.querySelector(".js-fulfillment-form-status");
const carrierSearchButton = document.querySelector(".js-fulfillment-carrier-search-btn");
const carrierResultsEl = document.querySelector(".js-fulfillment-carrier-results");
const couponSearchInput = document.querySelector(".js-fulfillment-coupon-search-input");
const couponSearchButton = document.querySelector(".js-fulfillment-coupon-search-btn");
const couponRefreshButton = document.querySelector(".js-fulfillment-coupon-refresh-btn");
const couponStatusEl = document.querySelector(".js-fulfillment-coupon-status");
const couponListEl = document.querySelector(".js-fulfillment-coupon-list");
const couponFormEl = document.querySelector(".js-fulfillment-coupon-form");
const couponFormStatusEl = document.querySelector(".js-fulfillment-coupon-form-status");
const couponResetButton = document.querySelector(".js-fulfillment-coupon-reset-btn");
const couponGenerateButton = document.querySelector(".js-fulfillment-coupon-generate-btn");
const hasOrderPage = Boolean(orderListEl || selectionEl || formEl || searchInput || searchButton || refreshButton);
const hasCouponPage = Boolean(couponListEl || couponFormEl || couponSearchInput || couponSearchButton || couponRefreshButton);

const COUPON_PRESETS = {
  manual: null,
  welcome: {
    title: "신규 회원 환영 10%",
    scope: "targeted",
    discountType: "percent",
    discountValue: 10,
    minimumOrderAmount: 50000,
    maximumDiscountAmount: 30000,
    usageLimit: 1,
    expiresInDays: 30,
  },
  recovery: {
    title: "CS 보상 5,000원",
    scope: "targeted",
    discountType: "fixed",
    discountValue: 5000,
    minimumOrderAmount: 50000,
    maximumDiscountAmount: 0,
    usageLimit: 1,
    expiresInDays: 14,
  },
  campaign: {
    title: "공개 캠페인 10%",
    scope: "public",
    discountType: "percent",
    discountValue: 10,
    minimumOrderAmount: 70000,
    maximumDiscountAmount: 20000,
    usageLimit: 300,
    expiresInDays: 7,
  },
};

const state = {
  accessToken: sessionStorage.getItem(ADMIN_ACCESS_TOKEN_KEY) || "",
  accessExpiresAt: sessionStorage.getItem(ADMIN_ACCESS_EXPIRES_AT_KEY) || "",
  isAuthorized: false,
  orders: [],
  selectedOrderId: "",
  coupons: [],
  selectedCouponId: "",
  config: null,
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPrice(value) {
  return `₩${Number(value || 0).toLocaleString("ko-KR")}`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const formatter = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${formatter(date.getMonth() + 1)}-${formatter(date.getDate())}T${formatter(date.getHours())}:${formatter(date.getMinutes())}`;
}

function parseDateTimeLocal(value) {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function formatRemainingSession(value) {
  if (!value) return "";
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) {
    return "";
  }

  const diffMs = expiresAt.getTime() - Date.now();
  if (diffMs <= 0) {
    return "곧";
  }

  const totalMinutes = Math.max(1, Math.ceil(diffMs / 60000));
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  }

  return `${totalMinutes}분`;
}

function formatCouponValue(coupon) {
  if (!coupon) return "—";
  return coupon.discountType === "percent"
    ? `${Number(coupon.discountValue || 0)}%`
    : formatPrice(coupon.discountValue || 0);
}

function formatCouponRule(coupon) {
  if (!coupon) return "—";

  const parts = [formatCouponValue(coupon)];
  if (Number(coupon.minimumOrderAmount || 0) > 0) {
    parts.push(`최소 ${formatPrice(coupon.minimumOrderAmount)}`);
  }
  if (Number(coupon.maximumDiscountAmount || 0) > 0) {
    parts.push(`최대 ${formatPrice(coupon.maximumDiscountAmount)}`);
  }

  return parts.join(" · ");
}

function resolveCouponTargetLabel(coupon) {
  if (!coupon) return "—";
  if (coupon.scope === "public") {
    return "공개 쿠폰";
  }

  return coupon.targetEmail || "계정 지정";
}

function buildPresetExpiry(days) {
  if (!days) return "";
  return formatDateTimeLocal(new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString());
}

function generateCouponCode(scope = "targeted", presetKey = "manual") {
  const presetPrefix = {
    welcome: "WELCOME",
    recovery: "CARE",
    campaign: "OPEN",
    manual: scope === "public" ? "OALUM" : "MEM",
  };
  const prefix = presetPrefix[presetKey] || presetPrefix.manual;
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  const tail = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${random}-${tail}`;
}

function setStatus(target, message = "", type = "info") {
  if (!target) return;
  target.textContent = message;
  target.classList.remove("is-success", "is-error");
  if (type === "success") target.classList.add("is-success");
  if (type === "error") target.classList.add("is-error");
}

function setButtonLoading(button, loading, loadingText) {
  if (!button) return;
  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent || "";
  }

  button.disabled = loading;
  button.textContent = loading ? loadingText : button.dataset.defaultLabel;
}

function persistAdminAccess(token, expiresAt = "") {
  state.accessToken = String(token || "").trim();
  state.accessExpiresAt = String(expiresAt || "").trim();

  if (state.accessToken) {
    sessionStorage.setItem(ADMIN_ACCESS_TOKEN_KEY, state.accessToken);
  } else {
    sessionStorage.removeItem(ADMIN_ACCESS_TOKEN_KEY);
  }

  if (state.accessExpiresAt) {
    sessionStorage.setItem(ADMIN_ACCESS_EXPIRES_AT_KEY, state.accessExpiresAt);
  } else {
    sessionStorage.removeItem(ADMIN_ACCESS_EXPIRES_AT_KEY);
  }
}

function clearAdminAccess() {
  persistAdminAccess("", "");
  state.isAuthorized = false;
}

function resetAdminData() {
  state.orders = [];
  state.selectedOrderId = "";
  state.coupons = [];
  state.selectedCouponId = "";
  state.config = null;

  renderOrders();
  renderSelection();
  renderCoupons();
  fillCouponForm(null);
}

function applyAccessState() {
  const unlocked = Boolean(state.isAuthorized && state.accessToken);

  authGuardEls.forEach((element) => {
    element.hidden = !unlocked;
  });

  if (accessBadgeEl) {
    accessBadgeEl.textContent = unlocked ? "세션 활성" : "잠금 상태";
    accessBadgeEl.classList.toggle("is-success", unlocked);
  }

  if (accessCopyEl) {
    accessCopyEl.textContent = unlocked
      ? "주문 및 쿠폰 관리 패널이 열려 있습니다. 이 브라우저에는 원문 관리자 키를 저장하지 않고 짧은 관리자 세션만 유지합니다."
      : "관리자 인증 전에는 주문/쿠폰 데이터가 로드되지 않습니다. 이 브라우저에는 ORDER_ADMIN_SECRET 원문을 저장하지 않습니다.";
  }

  if (accessMetaEl) {
    accessMetaEl.textContent = unlocked
      ? (state.accessExpiresAt
        ? `세션 만료 예정: ${formatDate(state.accessExpiresAt)} · 약 ${formatRemainingSession(state.accessExpiresAt)} 후 다시 인증됩니다.`
        : "관리자 세션이 활성화되었습니다.")
      : "우발 접근 시에도 데이터와 수정 패널은 잠금 상태를 유지합니다.";
  }
}

function clearRuntimeStatuses() {
  setStatus(listStatusEl, "");
  setStatus(formStatusEl, "");
  setStatus(couponStatusEl, "");
  setStatus(couponFormStatusEl, "");
}

function lockAdminSurface(authMessage = "", type = "info") {
  clearAdminAccess();
  resetAdminData();
  applyAccessState();
  clearRuntimeStatuses();
  if (authForm) {
    authForm.elements.adminSecret.value = "";
  }
  if (authMessage !== null) {
    setStatus(authStatusEl, authMessage, type);
  }
}

function getAuthHeaders(includeJson = false) {
  const headers = {
    Accept: "application/json",
  };

  if (state.accessToken) {
    headers.Authorization = `Bearer ${state.accessToken}`;
  }

  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

async function requestFulfillment(url, { method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: getAuthHeaders(body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    const error = new Error(payload?.error || `Request failed: ${response.status}`);
    error.status = response.status;
    error.details = payload?.details || null;
    throw error;
  }

  return payload;
}

async function createAdminSession(secret) {
  const response = await fetch("/api/orders/admin-session", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ adminSecret: secret }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    const error = new Error(payload?.error || `Request failed: ${response.status}`);
    error.status = response.status;
    error.details = payload?.details || null;
    throw error;
  }

  return payload;
}

async function verifyAdminSession() {
  return requestFulfillment("/api/orders/admin-session");
}

function resolveShipmentLabel(order) {
  const shipment = order?.shipment || null;
  const status = String(shipment?.status || order?.paymentStatus || order?.status || "confirmed").trim();
  const labels = {
    confirmed: "주문 확인 완료",
    ready: "배송 준비 중",
    packing: "배송 준비 중",
    shipped: "배송 중",
    delivered: "배송 완료",
    returned: "반송 완료",
    cancelled: "주문 취소",
    refunded: "환불 완료",
  };
  return labels[status] || status || "주문 확인 완료";
}

function renderOrders() {
  if (!orderListEl) return;

  if (!state.orders.length) {
    orderListEl.innerHTML = '<div class="fulfillment-empty">조회된 주문이 없습니다.</div>';
    return;
  }

  orderListEl.innerHTML = state.orders.map((order) => {
    const activeClass = order.orderId === state.selectedOrderId ? " is-active" : "";
    const firstItem = order.items?.[0] || null;
    const trackingText = order.shipment?.trackingNumber
      ? `${escapeHtml(order.shipment.carrier || order.shipment.carrierId || "택배사")} / ${escapeHtml(order.shipment.trackingNumber)}`
      : "운송장 미등록";

    return `
      <button type="button" class="fulfillment-order-card${activeClass}" data-order-id="${escapeHtml(order.orderId)}">
        <div class="fulfillment-order-card__top">
          <strong>${escapeHtml(order.orderName || firstItem?.title || "주문 상품")}</strong>
          <span>${escapeHtml(resolveShipmentLabel(order))}</span>
        </div>
        <p class="fulfillment-order-card__meta">${escapeHtml(order.orderId)} · ${escapeHtml(formatDate(order.createdAt))}</p>
        <p class="fulfillment-order-card__meta">${escapeHtml(formatPrice(order.totalAmount || 0))}</p>
        <p class="fulfillment-order-card__meta">${trackingText}</p>
      </button>
    `;
  }).join("");
}

function getSelectedOrder() {
  return state.orders.find((order) => order.orderId === state.selectedOrderId) || null;
}

function getSelectedCoupon() {
  return state.coupons.find((coupon) => coupon.id === state.selectedCouponId) || null;
}

function syncCouponTargetField() {
  if (!couponFormEl) return;

  const isPublic = couponFormEl.elements.scope.value === "public";
  couponFormEl.elements.targetEmail.disabled = isPublic;

  if (isPublic) {
    couponFormEl.elements.targetEmail.value = "";
  }
}

function renderCoupons() {
  if (!couponListEl) return;

  if (!state.coupons.length) {
    couponListEl.innerHTML = '<div class="fulfillment-empty">조회된 쿠폰이 없습니다.</div>';
    return;
  }

  couponListEl.innerHTML = state.coupons.map((coupon) => {
    const activeClass = coupon.id === state.selectedCouponId ? " is-active" : "";
    const statusLabel = coupon.isActive ? "사용 중" : "중지";
    const usageLabel = `활성 ${coupon.activeUseCount}/${coupon.usageLimit} · 완료 ${coupon.appliedUseCount}`;
    const expiryLabel = coupon.expiresAt ? `만료 ${formatDate(coupon.expiresAt)}` : "상시";

    return `
      <button type="button" class="fulfillment-order-card${activeClass}" data-coupon-id="${escapeHtml(coupon.id)}">
        <div class="fulfillment-order-card__top">
          <strong>${escapeHtml(coupon.title)}</strong>
          <span>${escapeHtml(statusLabel)}</span>
        </div>
        <p class="fulfillment-order-card__meta">${escapeHtml(coupon.code)} · ${escapeHtml(formatCouponRule(coupon))}</p>
        <p class="fulfillment-order-card__meta">${escapeHtml(resolveCouponTargetLabel(coupon))} · ${escapeHtml(usageLabel)}</p>
        <p class="fulfillment-order-card__meta">${escapeHtml(expiryLabel)}</p>
      </button>
    `;
  }).join("");
}

function fillCouponForm(coupon = null) {
  if (!couponFormEl) return;

  couponFormEl.elements.couponId.value = coupon?.id || "";
  couponFormEl.elements.preset.value = "manual";
  couponFormEl.elements.code.value = coupon?.code || generateCouponCode("targeted", "manual");
  couponFormEl.elements.title.value = coupon?.title || "";
  couponFormEl.elements.scope.value = coupon?.scope || "targeted";
  couponFormEl.elements.targetEmail.value = coupon?.targetEmail || "";
  couponFormEl.elements.usageLimit.value = String(coupon?.usageLimit || 1);
  couponFormEl.elements.discountType.value = coupon?.discountType || "fixed";
  couponFormEl.elements.discountValue.value = String(coupon?.discountValue || 5000);
  couponFormEl.elements.minimumOrderAmount.value = String(coupon?.minimumOrderAmount || 0);
  couponFormEl.elements.maximumDiscountAmount.value = coupon?.maximumDiscountAmount ? String(coupon.maximumDiscountAmount) : "";
  couponFormEl.elements.startsAt.value = formatDateTimeLocal(coupon?.startsAt);
  couponFormEl.elements.expiresAt.value = formatDateTimeLocal(coupon?.expiresAt);
  couponFormEl.elements.isActive.checked = coupon?.isActive !== false;
  syncCouponTargetField();
}

function resetCouponForm() {
  state.selectedCouponId = "";
  fillCouponForm(null);
  if (couponFormEl) {
    couponFormEl.elements.title.value = "";
    couponFormEl.elements.minimumOrderAmount.value = "50000";
  }
  renderCoupons();
  setStatus(couponFormStatusEl, "");
}

function applyCouponPreset(presetKey) {
  if (!couponFormEl) return;

  const preset = COUPON_PRESETS[presetKey];
  if (!preset) {
    couponFormEl.elements.code.value = generateCouponCode(couponFormEl.elements.scope.value, presetKey);
    syncCouponTargetField();
    return;
  }

  couponFormEl.elements.title.value = preset.title;
  couponFormEl.elements.scope.value = preset.scope;
  couponFormEl.elements.discountType.value = preset.discountType;
  couponFormEl.elements.discountValue.value = String(preset.discountValue);
  couponFormEl.elements.minimumOrderAmount.value = String(preset.minimumOrderAmount);
  couponFormEl.elements.maximumDiscountAmount.value = preset.maximumDiscountAmount ? String(preset.maximumDiscountAmount) : "";
  couponFormEl.elements.usageLimit.value = String(preset.usageLimit);
  couponFormEl.elements.expiresAt.value = buildPresetExpiry(preset.expiresInDays);
  couponFormEl.elements.code.value = generateCouponCode(preset.scope, presetKey);
  if (preset.scope === "public") {
    couponFormEl.elements.targetEmail.value = "";
  }
  syncCouponTargetField();
}

function renderSelection() {
  if (!selectionEl || !formEl) return;

  const order = getSelectedOrder();
  if (!order) {
    selectionEl.innerHTML = '<div class="fulfillment-empty">왼쪽 목록에서 주문을 선택하세요.</div>';
    formEl.hidden = true;
    return;
  }

  const shipment = order.shipment || null;
  const itemMarkup = (order.items || []).map((item) => {
    const title = [item.title, item.editionLabel].filter(Boolean).join(" / ");
    return `<li>${escapeHtml(title || "상품")} ${item.quantity > 1 ? `× ${escapeHtml(item.quantity)}` : ""}</li>`;
  }).join("");
  const benefitLines = [];

  if (Number(order.coupon?.discountAmount || 0) > 0) {
    benefitLines.push(`쿠폰 ${order.coupon.code || ""} · -${formatPrice(order.coupon.discountAmount)}`);
  }

  if (Number(order.pointsUsed || 0) > 0) {
    benefitLines.push(`포인트 사용 · -${formatPrice(order.pointsUsed)}`);
  }

  if (Number(order.pointsEarned || 0) > 0) {
    const pointsLabel = order.pointsEarnedAt ? "포인트 적립 확정" : "배송 완료 시 적립";
    benefitLines.push(`${pointsLabel} · ${Number(order.pointsEarned).toLocaleString("ko-KR")}P`);
  }

  selectionEl.innerHTML = `
    <div class="fulfillment-summary">
      <div>
        <p class="fulfillment-summary__kicker">주문 번호</p>
        <strong>${escapeHtml(order.orderId)}</strong>
      </div>
      <div>
        <p class="fulfillment-summary__kicker">결제 상태</p>
        <strong>${escapeHtml(order.paymentStatus || order.status || "pending")}</strong>
      </div>
      <div>
        <p class="fulfillment-summary__kicker">결제 금액</p>
        <strong>${escapeHtml(formatPrice(order.totalAmount || 0))}</strong>
      </div>
      <div>
        <p class="fulfillment-summary__kicker">주문 일시</p>
        <strong>${escapeHtml(formatDate(order.createdAt))}</strong>
      </div>
    </div>
    <div class="fulfillment-order-meta">
      <p>${escapeHtml(order.customer?.name || "")}${order.customer?.email ? ` · ${escapeHtml(order.customer.email)}` : ""}</p>
      <p>${escapeHtml([order.shipping?.zipcode, order.shipping?.address1, order.shipping?.address2].filter(Boolean).join(" "))}</p>
      ${benefitLines.map((line) => `<p class="fulfillment-copy fulfillment-copy--quiet">${escapeHtml(line)}</p>`).join("")}
      <ul class="fulfillment-order-items">${itemMarkup}</ul>
      ${shipment?.trackerLastEventName || shipment?.trackerLastEventDescription ? `<p class="fulfillment-copy fulfillment-copy--quiet">최근 트래커 이벤트: ${escapeHtml([shipment.trackerLastEventName, shipment.trackerLastEventDescription].filter(Boolean).join(" / "))}</p>` : ""}
    </div>
  `;

  formEl.hidden = false;
  formEl.elements.orderId.value = order.orderId;
  formEl.elements.status.value = shipment?.status === "packing" ? "ready" : (shipment?.status || "confirmed");
  formEl.elements.carrierId.value = shipment?.carrierId || "";
  formEl.elements.carrier.value = shipment?.carrier || "";
  formEl.elements.trackingNumber.value = shipment?.trackingNumber || "";
  formEl.elements.trackingUrl.value = shipment?.trackingUrl || "";
  formEl.elements.shippedAt.value = formatDateTimeLocal(shipment?.shippedAt);
  formEl.elements.deliveredAt.value = formatDateTimeLocal(shipment?.deliveredAt);
}

function applySelectedOrder(order) {
  if (!order) return;
  const existingIndex = state.orders.findIndex((item) => item.orderId === order.orderId);
  if (existingIndex >= 0) {
    state.orders.splice(existingIndex, 1, order);
  } else {
    state.orders.unshift(order);
  }

  state.selectedOrderId = order.orderId;
  renderOrders();
  renderSelection();
}

async function loadOrders(query = "") {
  let options = {};
  if (typeof query === "object") {
    options = query || {};
    query = options.query || "";
  }

  const { fatalOnAuthError = false } = options;

  if (!state.isAuthorized || !state.accessToken) {
    setStatus(listStatusEl, "관리자 세션을 먼저 활성화해주세요.", "error");
    return false;
  }

  setStatus(listStatusEl, "주문 정보를 불러오는 중입니다.");

  try {
    const payload = await requestFulfillment(`/api/orders/fulfillment?limit=20&query=${encodeURIComponent(query)}`);
    state.orders = Array.isArray(payload.orders) ? payload.orders : [];
    state.config = payload.config || null;

    if (state.selectedOrderId) {
      const stillSelected = state.orders.find((order) => order.orderId === state.selectedOrderId);
      if (!stillSelected) {
        state.selectedOrderId = state.orders[0]?.orderId || "";
      }
    } else {
      state.selectedOrderId = state.orders[0]?.orderId || "";
    }

    renderOrders();
    renderSelection();
    setStatus(listStatusEl, state.orders.length ? `${state.orders.length}건의 주문을 불러왔습니다.` : "조회된 주문이 없습니다.", "success");
    return true;
  } catch (error) {
    if (error.status === 401) {
      lockAdminSurface("관리자 세션이 만료되었거나 유효하지 않습니다. 다시 잠금 해제해주세요.", "error");
      setStatus(listStatusEl, "관리자 세션을 다시 확인해주세요.", "error");
      if (fatalOnAuthError) {
        throw error;
      }
      return false;
    }

    if (error.status === 503) {
      lockAdminSurface("이 배포 환경에는 관리자 기능이 아직 활성화되어 있지 않습니다. ORDER_ADMIN_SECRET 설정을 확인해주세요.", "error");
      setStatus(listStatusEl, error.message || "관리자 기능이 아직 활성화되어 있지 않습니다.", "error");
      if (fatalOnAuthError) {
        throw error;
      }
      return false;
    }

    setStatus(listStatusEl, error.message || "주문 정보를 불러오지 못했습니다.", "error");
    return false;
  }
}

async function loadCoupons(query = "") {
  let options = {};
  if (typeof query === "object") {
    options = query || {};
    query = options.query || "";
  }

  const { fatalOnAuthError = false } = options;

  if (!state.isAuthorized || !state.accessToken) {
    setStatus(couponStatusEl, "관리자 세션을 먼저 활성화해주세요.", "error");
    return false;
  }

  setStatus(couponStatusEl, "쿠폰 정보를 불러오는 중입니다.");

  try {
    const payload = await requestFulfillment(`/api/orders/coupons?limit=30&query=${encodeURIComponent(query)}`);
    state.coupons = Array.isArray(payload.coupons) ? payload.coupons : [];

    if (state.selectedCouponId) {
      const stillSelected = state.coupons.find((coupon) => coupon.id === state.selectedCouponId);
      if (!stillSelected) {
        state.selectedCouponId = state.coupons[0]?.id || "";
      }
    } else {
      state.selectedCouponId = state.coupons[0]?.id || "";
    }

    renderCoupons();
    fillCouponForm(getSelectedCoupon());
    setStatus(couponStatusEl, state.coupons.length ? `${state.coupons.length}건의 쿠폰을 불러왔습니다.` : "조회된 쿠폰이 없습니다.", "success");
    return true;
  } catch (error) {
    if (error.status === 401) {
      lockAdminSurface("관리자 세션이 만료되었거나 유효하지 않습니다. 다시 잠금 해제해주세요.", "error");
      setStatus(couponStatusEl, "관리자 세션을 다시 확인해주세요.", "error");
      if (fatalOnAuthError) {
        throw error;
      }
      return false;
    }

    if (error.status === 503) {
      lockAdminSurface("이 배포 환경에는 관리자 기능이 아직 활성화되어 있지 않습니다. ORDER_ADMIN_SECRET 설정을 확인해주세요.", "error");
      setStatus(couponStatusEl, error.message || "관리자 기능이 아직 활성화되어 있지 않습니다.", "error");
      if (fatalOnAuthError) {
        throw error;
      }
      return false;
    }

    setStatus(couponStatusEl, error.message || "쿠폰 정보를 불러오지 못했습니다.", "error");
    return false;
  }
}

async function searchCarriers() {
  const searchValue = String(formEl?.elements?.carrierSearch?.value || "").trim();
  if (!searchValue) {
    setStatus(formStatusEl, "택배사 검색어를 입력해주세요.", "error");
    return;
  }

  if (!state.config?.deliveryTracker?.enabled) {
    setStatus(formStatusEl, "Delivery Tracker가 설정되지 않아 택배사 검색을 사용할 수 없습니다.", "error");
    return;
  }

  setStatus(formStatusEl, "택배사 정보를 조회하는 중입니다.");
  carrierResultsEl.hidden = true;
  carrierResultsEl.innerHTML = "";

  try {
    const payload = await requestFulfillment(`/api/orders/fulfillment?carrierSearch=${encodeURIComponent(searchValue)}`);
    const carriers = Array.isArray(payload.carriers) ? payload.carriers : [];

    if (!carriers.length) {
      setStatus(formStatusEl, "일치하는 택배사를 찾지 못했습니다.", "error");
      return;
    }

    carrierResultsEl.innerHTML = carriers.map((carrier) => `
      <button type="button" class="fulfillment-suggestion" data-carrier-id="${escapeHtml(carrier.id)}" data-carrier-name="${escapeHtml(carrier.name)}">
        <strong>${escapeHtml(carrier.name)}</strong>
        <span>${escapeHtml(carrier.id)}</span>
      </button>
    `).join("");
    carrierResultsEl.hidden = false;
    setStatus(formStatusEl, `${carriers.length}개의 택배사 후보를 찾았습니다.`, "success");
  } catch (error) {
    setStatus(formStatusEl, error.message || "택배사 검색에 실패했습니다.", "error");
  }
}

async function saveShipment(event) {
  event.preventDefault();

  const submitButton = formEl.querySelector("button[type='submit']");
  setButtonLoading(submitButton, true, "저장 중…");
  setStatus(formStatusEl, "배송 정보를 저장하는 중입니다.");

  try {
    const payload = await requestFulfillment("/api/orders/fulfillment", {
      method: "POST",
      body: {
        orderId: formEl.elements.orderId.value,
        status: formEl.elements.status.value,
        carrierId: String(formEl.elements.carrierId.value || "").trim(),
        carrier: String(formEl.elements.carrier.value || "").trim(),
        trackingNumber: String(formEl.elements.trackingNumber.value || "").trim(),
        trackingUrl: String(formEl.elements.trackingUrl.value || "").trim(),
        shippedAt: parseDateTimeLocal(formEl.elements.shippedAt.value),
        deliveredAt: parseDateTimeLocal(formEl.elements.deliveredAt.value),
      },
    });

    state.config = payload.config || state.config || null;
    applySelectedOrder(payload.order);

    if (payload.deliveryTracker?.warning) {
      setStatus(formStatusEl, `저장 완료. ${payload.deliveryTracker.warning}`, "error");
    } else if (payload.deliveryTracker?.registered) {
      setStatus(formStatusEl, "저장 완료. Delivery Tracker webhook이 등록 또는 갱신되었습니다.", "success");
    } else {
      setStatus(formStatusEl, "배송 정보를 저장했습니다.", "success");
    }
  } catch (error) {
    setStatus(formStatusEl, error.message || "배송 정보를 저장하지 못했습니다.", "error");
  } finally {
    setButtonLoading(submitButton, false, "저장 중…");
  }
}

async function saveCoupon(event) {
  event.preventDefault();

  if (!couponFormEl) return;

  const submitButton = couponFormEl.querySelector("button[type='submit']");
  setButtonLoading(submitButton, true, "저장 중…");
  setStatus(couponFormStatusEl, "쿠폰을 저장하는 중입니다.");

  try {
    const payload = await requestFulfillment("/api/orders/coupons", {
      method: "POST",
      body: {
        id: String(couponFormEl.elements.couponId.value || "").trim() || undefined,
        code: String(couponFormEl.elements.code.value || "").trim(),
        title: String(couponFormEl.elements.title.value || "").trim(),
        scope: couponFormEl.elements.scope.value,
        targetEmail: String(couponFormEl.elements.targetEmail.value || "").trim(),
        discountType: couponFormEl.elements.discountType.value,
        discountValue: Number(couponFormEl.elements.discountValue.value || 0),
        minimumOrderAmount: Number(couponFormEl.elements.minimumOrderAmount.value || 0),
        maximumDiscountAmount: Number(couponFormEl.elements.maximumDiscountAmount.value || 0),
        usageLimit: Number(couponFormEl.elements.usageLimit.value || 1),
        startsAt: parseDateTimeLocal(couponFormEl.elements.startsAt.value),
        expiresAt: parseDateTimeLocal(couponFormEl.elements.expiresAt.value),
        isActive: couponFormEl.elements.isActive.checked,
      },
    });

    const nextCoupon = payload.coupon || null;
    if (nextCoupon) {
      const index = state.coupons.findIndex((coupon) => coupon.id === nextCoupon.id);
      if (index >= 0) {
        state.coupons.splice(index, 1, nextCoupon);
      } else {
        state.coupons.unshift(nextCoupon);
      }
      state.selectedCouponId = nextCoupon.id;
      renderCoupons();
      fillCouponForm(nextCoupon);
    }

    setStatus(couponFormStatusEl, "쿠폰을 저장했습니다.", "success");
    setStatus(couponStatusEl, "쿠폰 목록을 최신 상태로 유지했습니다.", "success");
  } catch (error) {
    setStatus(couponFormStatusEl, error.message || "쿠폰을 저장하지 못했습니다.", "error");
  } finally {
    setButtonLoading(submitButton, false, "저장 중…");
  }
}

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = authForm.querySelector("button[type='submit']");
  const secret = String(authForm.elements.adminSecret.value || "").trim();

  if (!secret) {
    setStatus(authStatusEl, "관리자 키를 입력해주세요.", "error");
    return;
  }

  setButtonLoading(submitButton, true, "확인 중…");
  setStatus(authStatusEl, "관리자 세션을 확인하는 중입니다.");

  try {
    const session = await createAdminSession(secret);
    persistAdminAccess(session.accessToken, session.expiresAt);
    state.isAuthorized = true;
    authForm.elements.adminSecret.value = "";
    applyAccessState();

    const tasks = [];
    if (hasOrderPage) {
      tasks.push(loadOrders({ query: String(searchInput?.value || "").trim(), fatalOnAuthError: true }));
    }
    if (hasCouponPage) {
      tasks.push(loadCoupons({ query: String(couponSearchInput?.value || "").trim(), fatalOnAuthError: true }));
    }
    if (tasks.length) {
      await Promise.all(tasks);
    }

    const remaining = formatRemainingSession(session.expiresAt);
    setStatus(authStatusEl, remaining ? `관리자 세션을 활성화했습니다. 약 ${remaining} 후 다시 인증됩니다.` : "관리자 세션을 활성화했습니다.", "success");
  } catch (error) {
    if (error.status === 401) {
      lockAdminSurface("관리자 키를 다시 확인해주세요.", "error");
      return;
    }

    if (error.status === 503) {
      lockAdminSurface("이 배포 환경에는 관리자 기능이 아직 활성화되어 있지 않습니다. ORDER_ADMIN_SECRET 설정을 확인해주세요.", "error");
      return;
    }

    setStatus(authStatusEl, error.message || "관리자 세션을 활성화하지 못했습니다.", "error");
  } finally {
    setButtonLoading(submitButton, false, "확인 중…");
  }
});

authClearButton?.addEventListener("click", () => {
  lockAdminSurface("관리자 세션을 초기화했습니다.");
});

searchButton?.addEventListener("click", () => {
  loadOrders(String(searchInput?.value || "").trim());
});

refreshButton?.addEventListener("click", () => {
  if (searchInput) {
    searchInput.value = "";
  }
  loadOrders("");
});

couponSearchButton?.addEventListener("click", () => {
  loadCoupons(String(couponSearchInput?.value || "").trim());
});

couponRefreshButton?.addEventListener("click", () => {
  if (couponSearchInput) {
    couponSearchInput.value = "";
  }
  loadCoupons("");
});

orderListEl?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-order-id]");
  if (!button) return;

  state.selectedOrderId = button.dataset.orderId || "";
  renderOrders();
  renderSelection();
  setStatus(formStatusEl, "");
});

carrierSearchButton?.addEventListener("click", () => {
  searchCarriers();
});

carrierResultsEl?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-carrier-id]");
  if (!button || !formEl) return;

  formEl.elements.carrierId.value = button.dataset.carrierId || "";
  formEl.elements.carrier.value = button.dataset.carrierName || "";
  carrierResultsEl.hidden = true;
  setStatus(formStatusEl, "택배사 정보를 적용했습니다.", "success");
});

formEl?.addEventListener("submit", saveShipment);

couponListEl?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-coupon-id]");
  if (!button) return;

  state.selectedCouponId = button.dataset.couponId || "";
  renderCoupons();
  fillCouponForm(getSelectedCoupon());
  setStatus(couponFormStatusEl, "");
});

couponFormEl?.addEventListener("submit", saveCoupon);

couponResetButton?.addEventListener("click", () => {
  resetCouponForm();
});

couponGenerateButton?.addEventListener("click", () => {
  if (!couponFormEl) return;
  couponFormEl.elements.code.value = generateCouponCode(
    couponFormEl.elements.scope.value,
    couponFormEl.elements.preset.value,
  );
});

couponFormEl?.elements?.preset?.addEventListener("change", () => {
  applyCouponPreset(couponFormEl.elements.preset.value);
});

couponFormEl?.elements?.scope?.addEventListener("change", () => {
  syncCouponTargetField();
  if (!couponFormEl.elements.couponId.value) {
    couponFormEl.elements.code.value = generateCouponCode(
      couponFormEl.elements.scope.value,
      couponFormEl.elements.preset.value,
    );
  }
});

applyAccessState();

if (hasCouponPage) {
  fillCouponForm(null);
  if (couponFormEl) {
    couponFormEl.elements.minimumOrderAmount.value = "50000";
  }
}

if (state.accessToken) {
  verifyAdminSession()
    .then(async (payload) => {
      state.isAuthorized = true;
      persistAdminAccess(state.accessToken, payload.expiresAt || state.accessExpiresAt);
      applyAccessState();

      const tasks = [];
      if (hasOrderPage) {
        tasks.push(loadOrders({ query: "", fatalOnAuthError: true }));
      }
      if (hasCouponPage) {
        tasks.push(loadCoupons({ query: "", fatalOnAuthError: true }));
      }
      if (tasks.length) {
        await Promise.all(tasks);
      }

      const remaining = formatRemainingSession(state.accessExpiresAt);
      setStatus(authStatusEl, remaining ? `관리자 세션이 복원되었습니다. 약 ${remaining} 후 다시 인증됩니다.` : "관리자 세션이 복원되었습니다.", "success");
    })
    .catch((error) => {
      if (error.status === 401) {
        lockAdminSurface("저장된 관리자 세션이 만료되었거나 유효하지 않습니다. 다시 잠금 해제해주세요.", "error");
        return;
      }

      if (error.status === 503) {
        lockAdminSurface("이 배포 환경에는 관리자 기능이 아직 활성화되어 있지 않습니다. ORDER_ADMIN_SECRET 설정을 확인해주세요.", "error");
        return;
      }

      lockAdminSurface(error.message || "관리자 세션을 확인하지 못했습니다. 다시 잠금 해제해주세요.", "error");
    });
}