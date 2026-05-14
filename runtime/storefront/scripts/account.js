import { formatPrice } from "./utils/catalog.js";

const PROVIDER_LABELS = {
  direct: "이메일",
  kakao: "카카오",
  naver: "네이버",
  google: "Google",
};

const DEFAULT_SOCIAL_PROVIDERS = [
  { key: "kakao", label: "카카오로 계속하기", enabled: false },
  { key: "naver", label: "네이버로 계속하기", enabled: false },
  { key: "google", label: "Google로 계속하기", enabled: false },
];

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
    const error = new Error(payload?.error || "Request failed.");
    error.status = response.status;
    error.details = payload?.details || null;
    throw error;
  }

  return payload;
}

export function initAccountPage() {
  const authShell = document.querySelector(".js-account-auth-shell");
  const memberLayout = document.querySelector(".js-account-member-layout");
  const loginRequestForm = document.querySelector(".js-account-login-request-form");
  const loginVerifyForm = document.querySelector(".js-account-login-verify-form");
  const providerGridEl = document.querySelector(".js-account-provider-grid");
  const providerHelpEl = document.querySelector(".js-account-provider-help");
  const guestForm = document.querySelector(".js-account-guest-form");
  const profileForm = document.querySelector(".js-account-profile-form");
  const loginStatusEl = document.querySelector(".js-account-login-status");
  const guestStatusEl = document.querySelector(".js-account-guest-status");
  const memberStatusEl = document.querySelector(".js-account-member-status");
  const loginEmailDisplayEl = document.querySelector(".js-account-login-email-display");
  const loginDebugEl = document.querySelector(".js-account-login-debug");
  const guestResultEl = document.querySelector(".js-account-guest-result");
  const identitiesEl = document.querySelector(".js-account-identities");
  const logoutButton = document.querySelector(".js-account-logout");
  const loginResetButton = document.querySelector(".js-account-login-reset");
  const ordersEl = document.querySelector(".js-account-orders");
  const workshopsEl = document.querySelector(".js-account-workshops");
  const pointsEl = document.querySelector(".js-account-points");

  if (
    !authShell
    || !memberLayout
    || !loginRequestForm
    || !loginVerifyForm
    || !guestForm
    || !profileForm
    || !ordersEl
    || !workshopsEl
    || !pointsEl
  ) {
    return;
  }

  const state = {
    login: {
      pendingEmail: "",
      pendingFullName: "",
      debugCode: "",
    },
  };

  const urlMessage = readStatusFromUrl();
  const emptyOrdersMarkup = '<div class="account-empty">등록된 주문 내역이 없습니다.</div>';
  const emptyWorkshopsMarkup = '<div class="account-empty">등록된 워크숍 예약 내역이 없습니다.</div>';
  const loginFlow = {
    mode: "login",
    requestForm: loginRequestForm,
    verifyForm: loginVerifyForm,
    statusEl: loginStatusEl,
    emailDisplayEl: loginEmailDisplayEl,
    debugEl: loginDebugEl,
    requestButtonLabel: "발송 중…",
    verifyButtonLabel: "확인 중…",
    successMessage: "로그인되었습니다.",
  };

  function readStatusFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const provider = String(params.get("provider") || "").trim().toLowerCase();
    const auth = String(params.get("auth") || "").trim();
    const authError = String(params.get("authError") || "").trim();

    if (auth || authError) {
      const cleanUrl = `${window.location.pathname}${window.location.hash || ""}`;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    if (auth === "success") {
      return {
        type: "success",
        message: `${PROVIDER_LABELS[provider] || "소셜"} 계정으로 로그인되었습니다.`,
      };
    }

    if (!authError) {
      return null;
    }

    const authErrorMessages = {
      unsupported_provider: "지원하지 않는 로그인 방식입니다.",
      provider_not_configured: `${PROVIDER_LABELS[provider] || "선택한"} 로그인 설정이 아직 완료되지 않았습니다.`,
      oauth_cancelled: `${PROVIDER_LABELS[provider] || "소셜"} 로그인이 취소되었습니다.`,
      state_invalid: "로그인 세션이 만료되었습니다. 다시 시도해주세요.",
      email_required: `${PROVIDER_LABELS[provider] || "소셜"} 계정에서 이메일 제공 동의가 필요합니다.`,
      oauth_failed: `${PROVIDER_LABELS[provider] || "소셜"} 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.`,
    };

    return {
      type: "error",
      message: authErrorMessages[authError] || "로그인 처리 중 오류가 발생했습니다.",
    };
  }

  function renderIdentities(providers) {
    if (!identitiesEl) return;

    const items = Array.isArray(providers) && providers.length > 0 ? providers : ["direct"];
    identitiesEl.innerHTML = items.map((provider) => {
      const label = PROVIDER_LABELS[String(provider || "").trim().toLowerCase()] || provider;
      return `<span class="account-provider-chip">${escapeHtml(label)}</span>`;
    }).join("");
  }

  function createProviderElement(provider) {
    const key = String(provider?.key || "").trim().toLowerCase();
    const label = String(provider?.label || `${PROVIDER_LABELS[key] || key}로 계속하기`).trim();
    const enabled = provider?.enabled === true;

    if (enabled) {
      const link = document.createElement("a");
      link.className = `account-provider-btn account-provider-btn--${key}`;
      link.href = `./api/auth/oauth/start?provider=${encodeURIComponent(key)}&redirect=${encodeURIComponent("/account.html")}`;
      link.textContent = label;
      return link;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = `account-provider-btn account-provider-btn--${key} is-disabled`;
    button.disabled = true;
    button.textContent = label;
    return button;
  }

  function renderSocialProviders(providers, helpText = "") {
    if (!providerGridEl) return;

    const items = Array.isArray(providers) && providers.length > 0 ? providers : DEFAULT_SOCIAL_PROVIDERS;
    providerGridEl.innerHTML = "";

    for (const provider of items) {
      providerGridEl.appendChild(createProviderElement(provider));
    }

    if (!providerHelpEl) return;

    if (helpText) {
      providerHelpEl.textContent = helpText;
      return;
    }

    const enabledLabels = items
      .filter((provider) => provider.enabled)
      .map((provider) => PROVIDER_LABELS[String(provider.key || "").trim().toLowerCase()] || provider.label)
      .filter(Boolean);

    providerHelpEl.textContent = enabledLabels.length > 0
      ? `현재 활성화: ${enabledLabels.join(", ")}`
      : "현재 간편 로그인 설정이 아직 완료되지 않았습니다. 앱 등록과 환경 변수 설정 후 활성화됩니다.";
  }

  async function loadProviders() {
    try {
      const payload = await requestJson("./api/auth/providers");
      renderSocialProviders(payload?.providers || []);
    } catch (error) {
      console.error("Failed to load auth providers.", error);
      renderSocialProviders(
        DEFAULT_SOCIAL_PROVIDERS,
        "현재 페이지에서 간편 로그인 API를 불러오지 못했습니다. 정적 파일로만 열면 간편 로그인이 동작하지 않으며, Cloudflare Pages Functions 환경이 필요합니다.",
      );
    }
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

  function renderLoginFlow() {
    const flow = loginFlow;
    const flowState = state.login;
    const isVerifying = Boolean(flowState.pendingEmail);

    flow.requestForm.hidden = isVerifying;
    flow.verifyForm.hidden = !isVerifying;

    if (flow.requestForm.elements.email) {
      flow.requestForm.elements.email.value = flowState.pendingEmail || flow.requestForm.elements.email.value || "";
    }

    if (flow.requestForm.elements.fullName) {
      flow.requestForm.elements.fullName.value = flowState.pendingFullName || flow.requestForm.elements.fullName.value || "";
    }

    flow.emailDisplayEl.textContent = flowState.pendingEmail;
    flow.debugEl.hidden = !flowState.debugCode;
    flow.debugEl.textContent = flowState.debugCode ? `개발용 인증코드: ${flowState.debugCode}` : "";
  }

  function showLoggedOut() {
    document.body.classList.remove("is-authenticated");
    authShell.hidden = false;
    memberLayout.hidden = true;

    renderLoginFlow();

    guestResultEl.hidden = true;
    guestResultEl.innerHTML = "";
    setStatus(memberStatusEl, "");
    renderIdentities([]);
    pointsEl.textContent = "0 포인트";
    ordersEl.innerHTML = emptyOrdersMarkup;
    workshopsEl.innerHTML = emptyWorkshopsMarkup;
  }

  function renderOrders(orders) {
    if (!Array.isArray(orders) || orders.length === 0) {
      ordersEl.innerHTML = emptyOrdersMarkup;
      return;
    }

    ordersEl.innerHTML = orders.map((order) => {
      const orderName = escapeHtml(order.orderName || "주문 상품 없음");
      const orderId = escapeHtml(order.orderId || "-");
      const status = escapeHtml(order.paymentStatus || order.status || "-");
      const createdAt = escapeHtml(formatDate(order.createdAt));
      const totalAmount = escapeHtml(formatPrice(order.totalAmount));

      return `
        <article class="account-order">
          <div class="account-order-head">
            <p class="account-order-name">${orderName}</p>
            <strong class="account-order-total">${totalAmount}</strong>
          </div>
          <div class="account-order-meta">
            <span class="account-order-id">${orderId}</span>
            <span class="account-order-date">${createdAt}</span>
            <span class="account-order-state">${status}</span>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderWorkshopReservations(reservations) {
    if (!Array.isArray(reservations) || reservations.length === 0) {
      workshopsEl.innerHTML = emptyWorkshopsMarkup;
      return;
    }

    workshopsEl.innerHTML = reservations.map((reservation) => {
      const title = escapeHtml(reservation.workshopTitle || "워크숍");
      const href = `./workshop.html?slug=${encodeURIComponent(reservation.workshopSlug || "")}`;
      const location = escapeHtml(reservation.workshopLocation || "Studio OALUM");
      const slotDate = escapeHtml(formatDate(reservation.slotDate));
      const slotTime = escapeHtml([reservation.slotStartTime, reservation.slotEndTime].filter(Boolean).join(" - "));
      const status = escapeHtml(reservation.status || "confirmed");

      return `
        <article class="account-order account-order--workshop">
          <div class="account-order-head">
            <p class="account-order-name"><a class="account-order-link" href="${href}">${title}</a></p>
            <strong class="account-order-total">${slotTime || "time tbd"}</strong>
          </div>
          <div class="account-order-meta">
            <span class="account-order-id">${slotDate}</span>
            <span class="account-order-date">${location}</span>
            <span class="account-order-state">${status}</span>
          </div>
        </article>
      `;
    }).join("");
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
        <span>${escapeHtml(order.paymentStatus || order.status || "-")}</span>
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
    renderIdentities(user.linkedProviders || []);
    pointsEl.textContent = `${Number(user.pointsBalance || 0).toLocaleString("ko-KR")} 포인트`;
    renderOrders(account?.orders || []);
    renderWorkshopReservations(account?.workshopReservations || []);
  }

  async function loadAccount({ silent = false } = {}) {
    try {
      const payload = await requestJson("./api/auth/account");
      state.login = { pendingEmail: "", pendingFullName: "", debugCode: "" };
      renderAuthenticated(payload.account);
      if (!silent) {
        setStatus(memberStatusEl, "로그인 상태를 확인했습니다.", "success");
      }
    } catch (error) {
      if (error.status === 401) {
        showLoggedOut();
        if (!silent) {
          setStatus(loginStatusEl, "로그인 후 계정 정보를 확인할 수 있습니다.");
        }
        return;
      }

      showLoggedOut();
      setStatus(loginStatusEl, error.message || "계정 정보를 불러오지 못했습니다.", "error");
    }
  }

  function resetLoginFlow(message = "") {
    state.login = {
      pendingEmail: "",
      pendingFullName: "",
      debugCode: "",
    };

    loginFlow.verifyForm.reset();
    renderLoginFlow();

    if (message) {
      setStatus(loginFlow.statusEl, message);
    }
  }

  function attachLoginHandlers() {
    const flow = loginFlow;

    flow.requestForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = flow.requestForm.querySelector("button[type='submit']");
      const email = String(flow.requestForm.elements.email.value || "").trim();
      const fullName = String(flow.requestForm.elements.fullName?.value || "").trim();

      setButtonLoading(submitButton, true, flow.requestButtonLabel);

      try {
        const payload = await requestJson("./api/auth/request", {
          method: "POST",
          body: {
            mode: "login",
            email,
            fullName,
          },
        });

        state.login = {
          pendingEmail: email,
          pendingFullName: fullName,
          debugCode: payload?.debugCode || "",
        };
        renderLoginFlow();
        flow.verifyForm.elements.code.value = "";
        flow.verifyForm.elements.code.focus();
        setStatus(flow.statusEl, "인증코드를 전송했습니다. 메일함을 확인해주세요.", "success");
      } catch (error) {
        setStatus(flow.statusEl, error.message || "인증코드를 전송하지 못했습니다.", "error");
      } finally {
        setButtonLoading(submitButton, false, flow.requestButtonLabel);
      }
    });

    flow.verifyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = flow.verifyForm.querySelector("button[type='submit']");
      const code = String(flow.verifyForm.elements.code.value || "").trim();

      setButtonLoading(submitButton, true, flow.verifyButtonLabel);

      try {
        await requestJson("./api/auth/verify", {
          method: "POST",
          body: {
            mode: "login",
            email: state.login.pendingEmail,
            code,
            fullName: state.login.pendingFullName,
          },
        });

        await loadAccount({ silent: true });
        setStatus(memberStatusEl, flow.successMessage, "success");
        window.dispatchEvent(new Event("studiooalum:auth-changed"));
      } catch (error) {
        setStatus(flow.statusEl, error.message || "인증코드를 확인하지 못했습니다.", "error");
      } finally {
        setButtonLoading(submitButton, false, flow.verifyButtonLabel);
      }
    });
  }

  attachLoginHandlers();

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
      setStatus(memberStatusEl, "계정 정보를 업데이트했습니다.", "success");
    } catch (error) {
      if (error.status === 401) {
        state.login = { pendingEmail: "", pendingFullName: "", debugCode: "" };
        showLoggedOut();
        setStatus(loginStatusEl, "세션이 만료되었습니다. 다시 로그인해주세요.", "error");
        return;
      }

      setStatus(memberStatusEl, error.message || "계정 정보를 저장하지 못했습니다.", "error");
    } finally {
      setButtonLoading(submitButton, false, "저장 중…");
    }
  });

  loginResetButton?.addEventListener("click", () => {
    resetLoginFlow("다른 이메일 주소를 입력해주세요.");
    loginRequestForm.elements.email.focus();
  });

  guestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = guestForm.querySelector("button[type='submit']");
    const orderId = String(guestForm.elements.orderId.value || "").trim();
    const email = String(guestForm.elements.email.value || "").trim();

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
      setStatus(guestStatusEl, "비회원 주문 정보를 확인했습니다.", "success");
    } catch (error) {
      renderGuestOrder(null);
      setStatus(guestStatusEl, error.message || "주문 정보를 불러오지 못했습니다.", "error");
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

      state.login = { pendingEmail: "", pendingFullName: "", debugCode: "" };
      showLoggedOut();
      setStatus(loginStatusEl, "로그아웃되었습니다.");
      window.dispatchEvent(new Event("studiooalum:auth-changed"));
    } catch (error) {
      setStatus(memberStatusEl, error.message || "로그아웃하지 못했습니다.", "error");
    } finally {
      setButtonLoading(logoutButton, false, "로그아웃 중…");
    }
  });

  window.addEventListener("studiooalum:auth-changed", () => {
    loadAccount({ silent: true });
  });

  showLoggedOut();
  renderLoginFlow();
  loadProviders();
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