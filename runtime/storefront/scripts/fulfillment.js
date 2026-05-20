const ADMIN_SECRET_KEY = "studiooalum:order-admin-secret";

const authForm = document.querySelector(".js-fulfillment-auth-form");
const authClearButton = document.querySelector(".js-fulfillment-auth-clear");
const authStatusEl = document.querySelector(".js-fulfillment-auth-status");
const searchInput = document.querySelector(".js-fulfillment-search-input");
const searchButton = document.querySelector(".js-fulfillment-search-btn");
const refreshButton = document.querySelector(".js-fulfillment-refresh-btn");
const listStatusEl = document.querySelector(".js-fulfillment-list-status");
const orderListEl = document.querySelector(".js-fulfillment-order-list");
const configEl = document.querySelector(".js-fulfillment-config");
const selectionEl = document.querySelector(".js-fulfillment-selection");
const formEl = document.querySelector(".js-fulfillment-form");
const formStatusEl = document.querySelector(".js-fulfillment-form-status");
const carrierSearchButton = document.querySelector(".js-fulfillment-carrier-search-btn");
const carrierResultsEl = document.querySelector(".js-fulfillment-carrier-results");

const state = {
  secret: sessionStorage.getItem(ADMIN_SECRET_KEY) || "",
  orders: [],
  selectedOrderId: "",
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

function getAuthHeaders(includeJson = false) {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${state.secret}`,
  };

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

function resolveShipmentLabel(order) {
  const shipment = order?.shipment || null;
  const status = String(shipment?.status || order?.paymentStatus || order?.status || "confirmed").trim();
  const labels = {
    confirmed: "주문 확인 완료",
    ready: "배송 준비 중",
    packing: "포장 중",
    shipped: "배송 중",
    delivered: "배송 완료",
    returned: "반송 완료",
    cancelled: "주문 취소",
    refunded: "환불 완료",
  };
  return labels[status] || status || "주문 확인 완료";
}

function renderConfig(config) {
  state.config = config || null;

  if (!configEl) return;

  if (!config) {
    configEl.innerHTML = '<div class="fulfillment-empty">연동 상태를 확인할 수 없습니다.</div>';
    return;
  }

  const deliveryTracker = config.deliveryTracker || {};
  const chips = [
    `<span class="fulfillment-chip ${deliveryTracker.enabled ? "is-active" : ""}">Delivery Tracker API ${deliveryTracker.enabled ? "활성" : "미설정"}</span>`,
    `<span class="fulfillment-chip ${deliveryTracker.trackingLinkSupported ? "is-active" : ""}">Tracking Link ${deliveryTracker.trackingLinkSupported ? "활성" : "미설정"}</span>`,
    `<span class="fulfillment-chip ${deliveryTracker.webhookProtected ? "is-active" : ""}">Webhook Secret ${deliveryTracker.webhookProtected ? "보호됨" : "미설정"}</span>`,
  ];

  configEl.innerHTML = `<div class="fulfillment-chip-row">${chips.join("")}</div>`;
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
      <ul class="fulfillment-order-items">${itemMarkup}</ul>
      ${shipment?.trackerLastEventName || shipment?.trackerLastEventDescription ? `<p class="fulfillment-copy fulfillment-copy--quiet">최근 트래커 이벤트: ${escapeHtml([shipment.trackerLastEventName, shipment.trackerLastEventDescription].filter(Boolean).join(" / "))}</p>` : ""}
    </div>
  `;

  formEl.hidden = false;
  formEl.elements.orderId.value = order.orderId;
  formEl.elements.status.value = shipment?.status || "confirmed";
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
  if (!state.secret) {
    setStatus(listStatusEl, "관리자 키를 먼저 입력해주세요.", "error");
    return;
  }

  setStatus(listStatusEl, "주문 정보를 불러오는 중입니다.");

  try {
    const payload = await requestFulfillment(`/api/orders/fulfillment?limit=20&query=${encodeURIComponent(query)}`);
    state.orders = Array.isArray(payload.orders) ? payload.orders : [];
    renderConfig(payload.config || null);

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
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem(ADMIN_SECRET_KEY);
      state.secret = "";
      renderOrders();
      renderSelection();
      setStatus(authStatusEl, "관리자 키가 올바르지 않습니다.", "error");
      setStatus(listStatusEl, "관리자 키를 다시 입력해주세요.", "error");
      return;
    }

    setStatus(listStatusEl, error.message || "주문 정보를 불러오지 못했습니다.", "error");
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

    renderConfig(payload.config || state.config);
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

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = authForm.querySelector("button[type='submit']");
  const secret = String(authForm.elements.adminSecret.value || "").trim();

  if (!secret) {
    setStatus(authStatusEl, "관리자 키를 입력해주세요.", "error");
    return;
  }

  setButtonLoading(submitButton, true, "확인 중…");
  state.secret = secret;
  sessionStorage.setItem(ADMIN_SECRET_KEY, secret);

  try {
    await loadOrders(String(searchInput?.value || "").trim());
    setStatus(authStatusEl, "관리자 세션을 활성화했습니다.", "success");
  } finally {
    setButtonLoading(submitButton, false, "확인 중…");
  }
});

authClearButton?.addEventListener("click", () => {
  sessionStorage.removeItem(ADMIN_SECRET_KEY);
  state.secret = "";
  state.orders = [];
  state.selectedOrderId = "";
  authForm.elements.adminSecret.value = "";
  renderOrders();
  renderSelection();
  renderConfig(null);
  setStatus(authStatusEl, "관리자 세션을 초기화했습니다.");
  setStatus(listStatusEl, "");
  setStatus(formStatusEl, "");
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

if (state.secret) {
  authForm.elements.adminSecret.value = state.secret;
  loadOrders("").then(() => {
    setStatus(authStatusEl, "관리자 세션이 복원되었습니다.", "success");
  });
}