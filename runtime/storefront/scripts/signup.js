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

export function initSignupPage() {
  const requestForm = document.querySelector(".js-signup-request-form");
  const verifyForm = document.querySelector(".js-signup-verify-form");
  const statusEl = document.querySelector(".js-signup-status");
  const emailDisplayEl = document.querySelector(".js-signup-email-display");
  const debugEl = document.querySelector(".js-signup-debug");
  const resetButton = document.querySelector(".js-signup-reset");

  if (!requestForm || !verifyForm || !statusEl || !emailDisplayEl || !debugEl) {
    return;
  }

  const state = {
    pendingEmail: "",
    pendingFullName: "",
    debugCode: "",
  };

  function renderFlow() {
    const isVerifying = Boolean(state.pendingEmail);

    requestForm.hidden = isVerifying;
    verifyForm.hidden = !isVerifying;
    requestForm.elements.fullName.value = state.pendingFullName || requestForm.elements.fullName.value || "";
    requestForm.elements.email.value = state.pendingEmail || requestForm.elements.email.value || "";
    emailDisplayEl.textContent = state.pendingEmail;
    debugEl.hidden = !state.debugCode;
    debugEl.textContent = state.debugCode ? `개발용 인증코드: ${state.debugCode}` : "";
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
        body: {
          mode: "signup",
          fullName,
          email,
        },
      });

      state.pendingFullName = fullName;
      state.pendingEmail = email;
      state.debugCode = payload?.debugCode || "";
      renderFlow();
      verifyForm.elements.code.value = "";
      verifyForm.elements.code.focus();
      setStatus(statusEl, "인증코드를 전송했습니다. 메일함을 확인해주세요.", "success");
    } catch (error) {
      setStatus(statusEl, error.message || "인증코드를 전송하지 못했습니다.", "error");
    } finally {
      setButtonLoading(submitButton, false, "발송 중…");
    }
  });

  verifyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = verifyForm.querySelector("button[type='submit']");
    const code = String(verifyForm.elements.code.value || "").trim();

    setButtonLoading(submitButton, true, "가입 중…");

    try {
      await requestJson("./api/auth/verify", {
        method: "POST",
        body: {
          mode: "signup",
          email: state.pendingEmail,
          code,
          fullName: state.pendingFullName,
        },
      });

      window.location.href = "./account.html?auth=success&provider=direct";
    } catch (error) {
      setStatus(statusEl, error.message || "회원가입을 완료하지 못했습니다.", "error");
    } finally {
      setButtonLoading(submitButton, false, "가입 중…");
    }
  });

  resetButton?.addEventListener("click", () => {
    state.pendingEmail = "";
    state.pendingFullName = "";
    state.debugCode = "";
    verifyForm.reset();
    renderFlow();
    requestForm.elements.fullName.focus();
    setStatus(statusEl, "입력 내용을 수정해주세요.");
  });

  renderFlow();
}