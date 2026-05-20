import { imageUrl } from "./sanity/image.js";
import { formatPrice } from "./utils/catalog.js";
import { getWorkshopPoster } from "./utils/workshops.js";

const PAGE_SIZE = 4;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isValidEmail(value) {
  return EMAIL_PATTERN.test(String(value || "").trim());
}

function resolveImageUrl(image, options) {
  if (!image) {
    return "";
  }

  try {
    return imageUrl(image, options);
  } catch {
    return "";
  }
}

function getFriendlyApiMessage(error, fallbackMessage) {
  const fieldErrors = error?.details?.fieldErrors || null;
  if (fieldErrors?.email?.length) {
    return "이메일 주소를 다시 확인해주세요.";
  }

  if (fieldErrors?.password?.length) {
    return "비밀번호를 다시 확인해주세요.";
  }

  if (fieldErrors?.orderId?.length) {
    return "주문번호를 다시 확인해주세요.";
  }

  const message = String(error?.message || "").trim();
  if (!message || message === "Invalid request payload." || message === "입력한 내용을 다시 확인해주세요." || message === "Request body must be valid JSON.") {
    return fallbackMessage;
  }

  return message;
}

function formatOrderStatus(order) {
  const value = String(order?.paymentStatus || order?.status || "").trim().toLowerCase();

  if (["confirmed", "done", "paid", "completed", "success", "succeeded"].includes(value)) {
    return "결제 완료";
  }

  if (["pending", "ready", "waiting", "processing", "in_progress"].includes(value)) {
    return "결제 확인 중";
  }

  if (["canceled", "cancelled"].includes(value)) {
    return "주문 취소";
  }

  if (["refunded", "refund"].includes(value)) {
    return "환불 완료";
  }

  if (["partial_refunded", "partial-refunded"].includes(value)) {
    return "부분 환불";
  }

  if (["failed", "expired"].includes(value)) {
    return "결제 실패";
  }

  return "주문 접수";
}

function formatWorkshopStatus(reservation) {
  const value = String(reservation?.status || "").trim().toLowerCase();

  if (["confirmed", "booked"].includes(value)) {
    return "예약 완료";
  }

  if (["pending", "waiting"].includes(value)) {
    return "예약 확인 중";
  }

  if (["cancelled", "canceled"].includes(value)) {
    return "예약 취소";
  }

  if (["completed", "attended"].includes(value)) {
    return "참여 완료";
  }

  return "예약 접수";
}

function formatWorkshopTime(reservation) {
  const range = [reservation?.slotStartTime, reservation?.slotEndTime].filter(Boolean).join(" - ");
  return range || "시간 추후 안내";
}

function getEditionHref(slug) {
  const normalized = String(slug || "").trim();
  return normalized ? `./edition.html?slug=${encodeURIComponent(normalized)}` : "";
}

function getWorkshopHref(slug) {
  const normalized = String(slug || "").trim();
  return normalized ? `./workshop.html?slug=${encodeURIComponent(normalized)}` : "";
}

function setButtonLoading(button, loading, loadingText) {
  if (!button) return;

  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent || "";
  }

  button.disabled = loading;
  button.textContent = loading ? loadingText : button.dataset.defaultLabel;
}

async function requestJson(url, { method = "GET", body } = {}) {
  const init = {
    method,
    headers: {
      Accept: "application/json",
    },
    credentials: "same-origin",
  };

  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.error || "요청을 처리하지 못했습니다.");
    error.status = response.status;
    error.details = payload?.details || null;
    throw error;
  }

  return payload;
}

export function initAccountPage() {
  const authShell = document.querySelector(".js-account-auth-shell");
  const authTabButtons = Array.from(document.querySelectorAll(".js-account-auth-tab"));
  const memberLayout = document.querySelector(".js-account-member-layout");
  const loginForm = document.querySelector(".js-account-login-form");
  const guestForm = document.querySelector(".js-account-guest-form");
  const profileForm = document.querySelector(".js-account-profile-form");
  const loginStatusEl = document.querySelector(".js-account-login-status");
  const guestStatusEl = document.querySelector(".js-account-guest-status");
  const memberStatusEl = document.querySelector(".js-account-member-status");
  const guestResultEl = document.querySelector(".js-account-guest-result");
  const logoutButton = document.querySelector(".js-account-logout");
  const addressSearchButton = document.querySelector(".js-account-address-search");
  const ordersEl = document.querySelector(".js-account-orders");
  const workshopsEl = document.querySelector(".js-account-workshops");
  const pointsEl = document.querySelector(".js-account-points");

  if (
    !authShell
    || !memberLayout
    || !loginForm
    || !guestForm
    || !profileForm
    || !ordersEl
    || !workshopsEl
    || !pointsEl
  ) {
    return;
  }

  const urlMessage = readStatusFromUrl();
  const emptyOrdersMarkup = '<div class="account-empty">등록된 주문 내역이 없습니다.</div>';
  const emptyWorkshopsMarkup = '<div class="account-empty">등록된 워크숍 예약 내역이 없습니다.</div>';
  const state = {
    orders: [],
    workshops: [],
    orderPage: 1,
    workshopPage: 1,
  };

  function setActiveAuthPanel(panelName = "login") {
    const nextPanel = panelName === "guest" ? "guest" : "login";

    authShell.dataset.activePanel = nextPanel;
    authTabButtons.forEach((button) => {
      const active = button.dataset.authTab === nextPanel;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    });
  }

  function readStatusFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const auth = String(params.get("auth") || "").trim();

    if (auth) {
      const cleanUrl = `${window.location.pathname}${window.location.hash || ""}`;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    if (auth === "signup-success") {
      return {
        type: "success",
        message: "회원가입이 완료되었습니다. 바로 로그인되었습니다.",
      };
    }

    if (auth === "password-reset") {
      return {
        type: "success",
        message: "비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해주세요.",
      };
    }

    return null;
  }

  function setStatus(target, message = "", type = "info") {
    if (!target) return;

    target.textContent = message;
    target.classList.remove("is-success", "is-error");

    if (type === "success") {
      target.classList.add("is-success");
    } else if (type === "error") {
      target.classList.add("is-error");
    }
  }

  function showLoggedOut() {
    document.body.classList.remove("is-authenticated");
    authShell.hidden = false;
    memberLayout.hidden = true;
    loginForm.reset();
    guestForm.reset();
    guestResultEl.hidden = true;
    guestResultEl.innerHTML = "";
    setStatus(memberStatusEl, "");
    pointsEl.textContent = "0 포인트";
    state.orders = [];
    state.workshops = [];
    state.orderPage = 1;
    state.workshopPage = 1;
    ordersEl.innerHTML = emptyOrdersMarkup;
    workshopsEl.innerHTML = emptyWorkshopsMarkup;
  }

  authTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveAuthPanel(button.dataset.authTab || "login");
    });
  });

  ordersEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-account-page-type='orders']");
    if (!button) return;

    state.orderPage = Number(button.dataset.accountPage) || 1;
    renderOrders(state.orders);
  });

  workshopsEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-account-page-type='workshops']");
    if (!button) return;

    state.workshopPage = Number(button.dataset.accountPage) || 1;
    renderWorkshopReservations(state.workshops);
  });

  function createPaginationMarkup(pageType, currentPage, totalPages) {
    if (totalPages <= 1) {
      return "";
    }

    return `
      <nav class="account-pagination" aria-label="페이지 이동">
        ${Array.from({ length: totalPages }, (_, index) => {
          const page = index + 1;
          const activeClass = page === currentPage ? " is-active" : "";
          return `<button type="button" class="account-pagination__btn${activeClass}" data-account-page-type="${pageType}" data-account-page="${page}">${page}</button>`;
        }).join("")}
      </nav>
    `;
  }

  function formatOrderItemCopy(item) {
    const titleParts = [item?.title, item?.editionLabel].filter(Boolean).join(" / ");
    const quantity = Number(item?.quantity) || 0;
    return `${escapeHtml(titleParts || "상품")}${quantity > 1 ? ` × ${quantity}` : ""}`;
  }

  function renderOrderCard(order) {
    const items = Array.isArray(order?.items) ? order.items : [];
    const primaryItem = items[0] || null;
    const href = getEditionHref(primaryItem?.slug);
    const thumbUrl = resolveImageUrl(primaryItem?.image, { width: 160, height: 160 });
    const title = escapeHtml(order?.orderName || primaryItem?.title || "주문 상품");
    const itemsMarkup = items.length > 0
      ? `
        <div class="account-record__items">
          ${items.slice(0, 2).map((item) => `<p class="account-record__item">${formatOrderItemCopy(item)}</p>`).join("")}
          ${items.length > 2 ? `<p class="account-record__item account-record__item--more">외 ${items.length - 2}개 상품</p>` : ""}
        </div>
      `
      : "";

    return `
      <article class="account-record">
        <div class="account-record__media">
          ${href ? `<a class="account-record__thumb-link" href="${href}">` : '<div class="account-record__thumb-link">'}
            ${thumbUrl ? `<img class="account-record__thumb" src="${thumbUrl}" alt="${escapeHtml(primaryItem?.title || order?.orderName || "주문 상품")}" loading="lazy" />` : '<span class="account-record__fallback">상품</span>'}
          ${href ? "</a>" : "</div>"}
        </div>
        <div class="account-record__body">
          <div class="account-record__top">
            <p class="account-record__title">${href ? `<a class="account-record__title-link" href="${href}">${title}</a>` : title}</p>
            <strong class="account-order-total">${escapeHtml(formatPrice(order?.totalAmount || 0))}</strong>
          </div>
          <div class="account-record__meta">
            <span class="account-order-id">주문번호 ${escapeHtml(order?.orderId || "-")}</span>
            <span class="account-order-date">${escapeHtml(formatDate(order?.createdAt))}</span>
            <span class="account-order-state">${escapeHtml(formatOrderStatus(order))}</span>
          </div>
          ${itemsMarkup}
        </div>
      </article>
    `;
  }

  function renderWorkshopCard(reservation) {
    const href = getWorkshopHref(reservation?.workshopSlug);
    const posterAsset = getWorkshopPoster(reservation?.workshopSnapshot || {});
    const posterUrl = resolveImageUrl(posterAsset, { width: 160, height: 160 });
    const title = escapeHtml(reservation?.workshopTitle || "워크숍");

    return `
      <article class="account-record account-record--workshop">
        <div class="account-record__media">
          ${href ? `<a class="account-record__thumb-link" href="${href}">` : '<div class="account-record__thumb-link">'}
            ${posterUrl ? `<img class="account-record__thumb" src="${posterUrl}" alt="${title}" loading="lazy" />` : '<span class="account-record__fallback">워크숍</span>'}
          ${href ? "</a>" : "</div>"}
        </div>
        <div class="account-record__body">
          <div class="account-record__top">
            <p class="account-record__title">${href ? `<a class="account-record__title-link" href="${href}">${title}</a>` : title}</p>
            <strong class="account-order-total">${escapeHtml(formatWorkshopTime(reservation))}</strong>
          </div>
          <div class="account-record__meta">
            <span class="account-order-id">${escapeHtml(formatDate(reservation?.slotDate))}</span>
            <span class="account-order-date">${escapeHtml(reservation?.workshopLocation || "Studio OALUM")}</span>
            <span class="account-order-state">${escapeHtml(formatWorkshopStatus(reservation))}</span>
          </div>
        </div>
      </article>
    `;
  }

  function renderOrders(orders) {
    state.orders = Array.isArray(orders) ? orders : [];

    if (state.orders.length === 0) {
      ordersEl.innerHTML = emptyOrdersMarkup;
      return;
    }

    const totalPages = Math.ceil(state.orders.length / PAGE_SIZE);
    state.orderPage = Math.max(1, Math.min(state.orderPage, totalPages));
    const startIndex = (state.orderPage - 1) * PAGE_SIZE;
    const pageItems = state.orders.slice(startIndex, startIndex + PAGE_SIZE);
    ordersEl.innerHTML = `${pageItems.map(renderOrderCard).join("")}${createPaginationMarkup("orders", state.orderPage, totalPages)}`;
  }

  function renderWorkshopReservations(reservations) {
    state.workshops = Array.isArray(reservations) ? reservations : [];

    if (state.workshops.length === 0) {
      workshopsEl.innerHTML = emptyWorkshopsMarkup;
      return;
    }

    const totalPages = Math.ceil(state.workshops.length / PAGE_SIZE);
    state.workshopPage = Math.max(1, Math.min(state.workshopPage, totalPages));
    const startIndex = (state.workshopPage - 1) * PAGE_SIZE;
    const pageItems = state.workshops.slice(startIndex, startIndex + PAGE_SIZE);
    workshopsEl.innerHTML = `${pageItems.map(renderWorkshopCard).join("")}${createPaginationMarkup("workshops", state.workshopPage, totalPages)}`;
  }

  function renderGuestOrder(order) {
    if (!order) {
      guestResultEl.hidden = true;
      guestResultEl.innerHTML = "";
      return;
    }

    const itemsMarkup = Array.isArray(order.items) && order.items.length > 0
      ? `
        <div class="account-guest-items">
          ${order.items.map((item) => {
            const titleParts = [item.title, item.editionLabel].filter(Boolean).join(" / ");
            return `
              <div class="account-guest-item">
                <span class="account-guest-item-title">${escapeHtml(titleParts || "상품")}${item.quantity > 1 ? ` × ${escapeHtml(item.quantity)}` : ""}</span>
                <span class="account-guest-item-price">${escapeHtml(formatPrice(item.unitPrice * item.quantity))}</span>
              </div>
            `;
          }).join("")}
        </div>
      `
      : "";

    guestResultEl.innerHTML = `
      <div class="account-guest-head">
        <p class="account-order-name">${escapeHtml(order.orderName || "주문 상품")}</p>
        <strong class="account-order-total">${escapeHtml(formatPrice(order.totalAmount))}</strong>
      </div>
      <div class="account-guest-meta">
        <span>${escapeHtml(order.orderId || "-")}</span>
        <span>${escapeHtml(formatDate(order.createdAt))}</span>
        <span>${escapeHtml(formatOrderStatus(order))}</span>
      </div>
      ${itemsMarkup}
      <p class="account-copy">${escapeHtml(order.customerName || "주문자")}${order.customerPhone ? ` / ${escapeHtml(order.customerPhone)}` : ""}</p>
      <p class="account-copy">${escapeHtml([order.zipcode, order.address1, order.address2].filter(Boolean).join(" "))}</p>
    `;
    guestResultEl.hidden = false;
  }

  function renderAuthenticated(account) {
    const user = account?.user || {};

    document.body.classList.add("is-authenticated");
    authShell.hidden = true;
    memberLayout.hidden = false;

    profileForm.elements.email.value = user.email || "";
    profileForm.elements.fullName.value = user.fullName || "";
    profileForm.elements.phone.value = user.phone || "";
    profileForm.elements.zipcode.value = user.zipcode || "";
    profileForm.elements.address1.value = user.address1 || "";
    profileForm.elements.address2.value = user.address2 || "";
    pointsEl.textContent = `${Number(user.pointsBalance || 0).toLocaleString("ko-KR")} 포인트`;
    renderOrders(account?.orders || []);
    renderWorkshopReservations(account?.workshopReservations || []);
  }

  function openAddressSearch() {
    if (!window.daum?.Postcode) {
      setStatus(memberStatusEl, "주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.", "error");
      return;
    }

    new window.daum.Postcode({
      oncomplete(data) {
        profileForm.elements.zipcode.value = data.zonecode || "";
        profileForm.elements.address1.value = data.roadAddress || data.jibunAddress || "";
        profileForm.elements.address2.focus();
        setStatus(memberStatusEl, "검색한 주소를 불러왔습니다. 상세 주소를 입력한 뒤 저장해주세요.", "success");
      },
    }).open();
  }

  addressSearchButton?.addEventListener("click", () => {
    openAddressSearch();
  });

  async function loadAccount({ silent = false } = {}) {
    try {
      const payload = await requestJson("./api/auth/account");
      renderAuthenticated(payload.account);
      if (!silent) {
        setStatus(memberStatusEl, "계정 정보를 불러왔습니다.", "success");
      }
    } catch (error) {
      if (error.status === 401) {
        showLoggedOut();
        if (!silent) {
          setStatus(loginStatusEl, "로그인하시면 주문 내역과 기본 정보를 확인하실 수 있습니다.");
        }
        return;
      }

      if (error.status === 404 || error.status === 405 || error.status === 503) {
        showLoggedOut();
        if (!silent) {
          setStatus(loginStatusEl, "지금은 계정 서비스를 이용하기 어렵습니다. 잠시 후 다시 시도해주세요.");
        }
        return;
      }

      showLoggedOut();
      setStatus(loginStatusEl, getFriendlyApiMessage(error, "계정 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."), "error");
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = loginForm.querySelector("button[type='submit']");
    const email = String(loginForm.elements.email.value || "").trim();
    const password = String(loginForm.elements.password.value || "");

    if (!isValidEmail(email)) {
      setStatus(loginStatusEl, "이메일 주소를 다시 확인해주세요.", "error");
      loginForm.elements.email.focus();
      return;
    }

    if (!password) {
      setStatus(loginStatusEl, "비밀번호를 입력해주세요.", "error");
      loginForm.elements.password.focus();
      return;
    }

    setActiveAuthPanel("login");
    setButtonLoading(submitButton, true, "로그인 중…");

    try {
      await requestJson("./api/auth/login", {
        method: "POST",
        body: {
          email,
          password,
        },
      });

      await loadAccount({ silent: true });
      setStatus(memberStatusEl, "다시 만나서 반갑습니다. 계정 정보를 불러왔습니다.", "success");
      window.dispatchEvent(new Event("studiooalum:auth-changed"));
    } catch (error) {
      setStatus(loginStatusEl, getFriendlyApiMessage(error, "이메일 주소와 비밀번호를 다시 확인해주세요."), "error");
    } finally {
      setButtonLoading(submitButton, false, "로그인 중…");
      loginForm.elements.password.value = "";
    }
  });

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = profileForm.querySelector("button[type='submit']");

    setButtonLoading(submitButton, true, "저장 중…");

    try {
      const payload = await requestJson("./api/auth/account", {
        method: "POST",
        body: {
          fullName: profileForm.elements.fullName.value,
          phone: profileForm.elements.phone.value,
          zipcode: profileForm.elements.zipcode.value,
          address1: profileForm.elements.address1.value,
          address2: profileForm.elements.address2.value,
        },
      });

      renderAuthenticated(payload.account);
      setStatus(memberStatusEl, "내 계정 정보를 저장했습니다.", "success");
    } catch (error) {
      if (error.status === 401) {
        showLoggedOut();
        setStatus(loginStatusEl, "세션이 만료되었습니다. 다시 로그인해주세요.", "error");
        return;
      }

      setStatus(memberStatusEl, getFriendlyApiMessage(error, "계정 정보를 저장하지 못했습니다. 잠시 후 다시 시도해주세요."), "error");
    } finally {
      setButtonLoading(submitButton, false, "저장 중…");
    }
  });

  guestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = guestForm.querySelector("button[type='submit']");
    const orderId = String(guestForm.elements.orderId.value || "").trim();
    const email = String(guestForm.elements.email.value || "").trim();

    if (!orderId) {
      setStatus(guestStatusEl, "주문번호를 입력해주세요.", "error");
      guestForm.elements.orderId.focus();
      return;
    }

    if (!isValidEmail(email)) {
      setStatus(guestStatusEl, "이메일 주소를 다시 확인해주세요.", "error");
      guestForm.elements.email.focus();
      return;
    }

    setActiveAuthPanel("guest");
    setButtonLoading(submitButton, true, "조회 중…");

    try {
      const payload = await requestJson("./api/auth/guest-order", {
        method: "POST",
        body: {
          orderId,
          email,
        },
      });

      renderGuestOrder(payload.order || null);
      setStatus(guestStatusEl, "주문 정보를 불러왔습니다.", "success");
    } catch (error) {
      renderGuestOrder(null);
      setStatus(guestStatusEl, getFriendlyApiMessage(error, "주문 정보를 불러오지 못했습니다. 주문번호와 이메일을 다시 확인해주세요."), "error");
    } finally {
      setButtonLoading(submitButton, false, "조회 중…");
    }
  });

  logoutButton?.addEventListener("click", async () => {
    setButtonLoading(logoutButton, true, "로그아웃 중…");

    try {
      await requestJson("./api/auth/logout", {
        method: "POST",
      });

      showLoggedOut();
      setStatus(loginStatusEl, "안전하게 로그아웃되었습니다.");
      window.dispatchEvent(new Event("studiooalum:auth-changed"));
    } catch (error) {
      setStatus(memberStatusEl, getFriendlyApiMessage(error, "로그아웃을 완료하지 못했습니다. 잠시 후 다시 시도해주세요."), "error");
    } finally {
      setButtonLoading(logoutButton, false, "로그아웃 중…");
    }
  });

  window.addEventListener("studiooalum:auth-changed", () => {
    loadAccount({ silent: true });
  });

  setActiveAuthPanel(authShell.dataset.activePanel || "login");
  showLoggedOut();
  loadAccount({ silent: true }).finally(() => {
    if (urlMessage) {
      if (document.body.classList.contains("is-authenticated")) {
        setStatus(memberStatusEl, urlMessage.message, urlMessage.type);
      } else {
        setStatus(loginStatusEl, urlMessage.message, urlMessage.type);
      }
    }
  });
}