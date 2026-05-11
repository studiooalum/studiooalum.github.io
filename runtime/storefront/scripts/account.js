import { formatPrice } from "./utils/catalog.js";

const PROVIDER_LABELS = {
  direct: "이메일",
  kakao: "카카오",
  naver: "네이버",
  google: "Google",
};

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
  const requestForm = document.querySelector(".js-account-request-form");
  const verifyForm = document.querySelector(".js-account-verify-form");
  const profileForm = document.querySelector(".js-account-profile-form");
  const socialSectionEl = document.querySelector(".js-account-auth-social");
  const providerGridEl = document.querySelector(".js-account-provider-grid");
  const authDividerEl = document.querySelector(".js-account-auth-divider");
  const statusEl = document.querySelector(".js-account-status");
  const emailDisplayEl = document.querySelector(".js-account-email-display");
  const debugEl = document.querySelector(".js-account-debug");
  const authenticatedEl = document.querySelector(".js-account-authenticated");
  const authenticatedEmailEl = document.querySelector(".js-account-user-email");
  const identitiesEl = document.querySelector(".js-account-identities");
  const logoutButton = document.querySelector(".js-account-logout");
  const resetButton = document.querySelector(".js-account-reset");
  const ordersEl = document.querySelector(".js-account-orders");
  const pointsEl = document.querySelector(".js-account-points");
  const protectedPanels = Array.from(document.querySelectorAll("[data-account-protected]"));

  if (!requestForm || !verifyForm || !profileForm || !statusEl) {
    return;
  }

  const state = {
    pendingEmail: "",
    pendingFullName: "",
    debugCode: "",
  };

  const urlMessage = readStatusFromUrl();

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

  function renderSocialProviders(providers) {
    if (!socialSectionEl || !providerGridEl || !authDividerEl) {
      return;
    }

    const items = Array.isArray(providers) ? providers : [];
    providerGridEl.innerHTML = "";

    if (items.length === 0) {
      socialSectionEl.hidden = true;
      return;
    }

    socialSectionEl.hidden = false;
    authDividerEl.hidden = false;

    for (const provider of items) {
      const link = document.createElement("a");
      link.className = `account-provider-btn account-provider-btn--${provider.key}`;
      link.href = `./api/auth/oauth/start?provider=${encodeURIComponent(provider.key)}&redirect=${encodeURIComponent("/account.html")}`;
      link.textContent = provider.label || `${PROVIDER_LABELS[provider.key] || provider.key}로 계속하기`;
      providerGridEl.appendChild(link);
    }
  }

  function renderIdentities(providers) {
    if (!identitiesEl) return;

    const items = Array.isArray(providers) && providers.length > 0 ? providers : ["direct"];
    identitiesEl.innerHTML = items.map((provider) => {
      const label = PROVIDER_LABELS[String(provider || "").trim().toLowerCase()] || provider;
      return `<span class="account-provider-chip">${escapeHtml(label)}</span>`;
    }).join("");
  }

  async function loadProviders() {
    try {
      const payload = await requestJson("./api/auth/providers");
      renderSocialProviders(payload.providers || []);
    } catch (error) {
      console.error("Failed to load auth providers.", error);
      renderSocialProviders([]);
    }
  }

  function setStatus(message = "", type = "info") {
    statusEl.textContent = message;
    statusEl.classList.remove("is-success", "is-error");

    if (type === "success") {
      statusEl.classList.add("is-success");
    } else if (type === "error") {
      statusEl.classList.add("is-error");
    }
  }

  function showLoggedOut() {
    const isVerifying = Boolean(state.pendingEmail);

    requestForm.hidden = isVerifying;
    verifyForm.hidden = !isVerifying;
    authenticatedEl.hidden = true;
    protectedPanels.forEach((panel) => {
      panel.hidden = true;
    });

    requestForm.elements.fullName.value = state.pendingFullName || requestForm.elements.fullName.value || "";
    requestForm.elements.email.value = state.pendingEmail || requestForm.elements.email.value || "";
    emailDisplayEl.textContent = state.pendingEmail;
    debugEl.hidden = !state.debugCode;
    debugEl.textContent = state.debugCode ? `개발용 인증코드: ${state.debugCode}` : "";
    authenticatedEmailEl.textContent = "";
    renderIdentities([]);
    pointsEl.textContent = "0 포인트";
    ordersEl.innerHTML = '<div class="account-empty">등록된 주문 내역이 없습니다.</div>';
  }

  function renderOrders(orders) {
    if (!Array.isArray(orders) || orders.length === 0) {
      ordersEl.innerHTML = '<div class="account-empty">등록된 주문 내역이 없습니다.</div>';
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

  function renderAuthenticated(account) {
    const user = account?.user || {};

    requestForm.hidden = true;
    verifyForm.hidden = true;
    authenticatedEl.hidden = false;
    protectedPanels.forEach((panel) => {
      panel.hidden = false;
    });

    authenticatedEmailEl.textContent = user.email || "";
    profileForm.elements.email.value = user.email || "";
    profileForm.elements.fullName.value = user.fullName || "";
    profileForm.elements.phone.value = user.phone || "";
    profileForm.elements.zipcode.value = user.zipcode || "";
    profileForm.elements.address1.value = user.address1 || "";
    profileForm.elements.address2.value = user.address2 || "";
    renderIdentities(user.linkedProviders || []);
    pointsEl.textContent = `${Number(user.pointsBalance || 0).toLocaleString("ko-KR")} 포인트`;
    renderOrders(account?.orders || []);
  }

  async function loadAccount({ silent = false } = {}) {
    try {
      const payload = await requestJson("./api/auth/account");
      state.pendingEmail = "";
      state.pendingFullName = "";
      state.debugCode = "";
      renderAuthenticated(payload.account);
      if (!silent) {
        setStatus("로그인 상태를 확인했습니다.");
      }
    } catch (error) {
      if (error.status === 401) {
        showLoggedOut();
        if (!silent) {
          setStatus("로그인 후 계정 정보를 확인할 수 있습니다.");
        }
        return;
      }

      showLoggedOut();
      setStatus(error.message || "계정 정보를 불러오지 못했습니다.", "error");
    }
  }

  requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = requestForm.querySelector("button[type='submit']");
    const fullName = String(requestForm.elements.fullName.value || "").trim();
    const email = String(requestForm.elements.email.value || "").trim();

    setButtonLoading(submitButton, true, "발송 중…");

    try {
      const payload = await requestJson("./api/auth/request", {
        method: "POST",
        body: { email, fullName },
      });

      state.pendingFullName = fullName;
      state.pendingEmail = email;
      state.debugCode = payload?.debugCode || "";
      showLoggedOut();
      verifyForm.elements.code.value = "";
      verifyForm.elements.code.focus();
      setStatus("인증코드를 전송했습니다. 메일함을 확인해주세요.", "success");
    } catch (error) {
      setStatus(error.message || "인증코드를 전송하지 못했습니다.", "error");
    } finally {
      setButtonLoading(submitButton, false, "발송 중…");
    }
  });

  verifyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = verifyForm.querySelector("button[type='submit']");
    const code = String(verifyForm.elements.code.value || "").trim();

    setButtonLoading(submitButton, true, "확인 중…");

    try {
      await requestJson("./api/auth/verify", {
        method: "POST",
        body: {
          email: state.pendingEmail,
          code,
          fullName: state.pendingFullName,
        },
      });

      await loadAccount({ silent: true });
      setStatus("로그인되었습니다.", "success");
      window.dispatchEvent(new Event("studiooalum:auth-changed"));
    } catch (error) {
      setStatus(error.message || "인증코드를 확인하지 못했습니다.", "error");
    } finally {
      setButtonLoading(submitButton, false, "확인 중…");
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
      setStatus("계정 정보를 업데이트했습니다.", "success");
    } catch (error) {
      if (error.status === 401) {
        state.pendingEmail = "";
        state.debugCode = "";
        showLoggedOut();
      }

      setStatus(error.message || "계정 정보를 저장하지 못했습니다.", "error");
    } finally {
      setButtonLoading(submitButton, false, "저장 중…");
    }
  });

  resetButton?.addEventListener("click", () => {
    state.pendingEmail = "";
    state.pendingFullName = "";
    state.debugCode = "";
    verifyForm.reset();
    showLoggedOut();
    requestForm.elements.email.focus();
    setStatus("다른 이메일 주소를 입력해주세요.");
  });

  logoutButton?.addEventListener("click", async () => {
    setButtonLoading(logoutButton, true, "로그아웃 중…");

    try {
      await requestJson("./api/auth/logout", {
        method: "POST",
      });

      state.pendingEmail = "";
      state.pendingFullName = "";
      state.debugCode = "";
      showLoggedOut();
      setStatus("로그아웃되었습니다.");
      window.dispatchEvent(new Event("studiooalum:auth-changed"));
    } catch (error) {
      setStatus(error.message || "로그아웃하지 못했습니다.", "error");
    } finally {
      setButtonLoading(logoutButton, false, "로그아웃 중…");
    }
  });

  window.addEventListener("studiooalum:auth-changed", () => {
    loadAccount({ silent: true });
  });

  showLoggedOut();
  loadProviders();
  loadAccount({ silent: true }).finally(() => {
    if (urlMessage) {
      setStatus(urlMessage.message, urlMessage.type);
    }
  });
}