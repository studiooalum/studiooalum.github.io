function setButtonLoading(button, loading, loadingText) {
  if (!button) return;

  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent || "";
  }

  button.disabled = loading;
  button.textContent = loading ? loadingText : button.dataset.defaultLabel;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function getFriendlyApiMessage(error, fallbackMessage) {
  const fieldErrors = error?.details?.fieldErrors || null;
  if (fieldErrors?.email?.length) {
    return "이메일 주소를 다시 확인해주세요.";
  }

  if (fieldErrors?.code?.length) {
    return "인증코드 6자리를 다시 확인해주세요.";
  }

  if (fieldErrors?.password?.length) {
    return "비밀번호는 8자 이상으로 입력해주세요.";
  }

  const message = String(error?.message || "").trim();
  if (!message || message === "Invalid request payload." || message === "입력한 내용을 다시 확인해주세요." || message === "Request body must be valid JSON.") {
    return fallbackMessage;
  }

  return message;
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

export function initForgotPasswordPage() {
  const requestForm = document.querySelector(".js-password-reset-request-form");
  const confirmForm = document.querySelector(".js-password-reset-confirm-form");
  const requestStatusEl = document.querySelector(".js-password-reset-request-status");
  const confirmStatusEl = document.querySelector(".js-password-reset-confirm-status");
  const confirmPanel = document.querySelector(".js-password-reset-confirm-panel");
  const emailCopyEl = document.querySelector(".js-password-reset-email-copy");
  const debugEl = document.querySelector(".js-password-reset-debug");

  if (!requestForm || !confirmForm || !requestStatusEl || !confirmStatusEl || !confirmPanel || !emailCopyEl || !debugEl) {
    return;
  }

  let pendingEmail = "";

  function revealConfirmPanel(email, debugCode) {
    pendingEmail = email;
    emailCopyEl.textContent = `${email}로 전송된 인증코드를 입력하고 새 비밀번호를 설정해주세요.`;
    debugEl.hidden = !debugCode;
    debugEl.textContent = debugCode ? `개발용 인증코드: ${debugCode}` : "";
    confirmPanel.hidden = false;
    confirmForm.elements.code.focus();
  }

  requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = requestForm.querySelector("button[type='submit']");
    const email = String(requestForm.elements.email.value || "").trim();

    if (!isValidEmail(email)) {
      setStatus(requestStatusEl, "이메일 주소를 다시 확인해주세요.", "error");
      requestForm.elements.email.focus();
      return;
    }

    setButtonLoading(submitButton, true, "전송 중…");
    setStatus(requestStatusEl, "");
    setStatus(confirmStatusEl, "");

    try {
      const payload = await requestJson("./api/auth/password-reset/request", {
        method: "POST",
        body: {
          email,
        },
      });

      revealConfirmPanel(email, payload.debugCode || "");
      setStatus(requestStatusEl, "인증코드를 전송했습니다. 메일함을 확인해주세요.", "success");
    } catch (error) {
      confirmPanel.hidden = true;
      debugEl.hidden = true;
      setStatus(requestStatusEl, getFriendlyApiMessage(error, "인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요."), "error");
    } finally {
      setButtonLoading(submitButton, false, "전송 중…");
    }
  });

  confirmForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = confirmForm.querySelector("button[type='submit']");
    const code = String(confirmForm.elements.code.value || "").trim();
    const password = String(confirmForm.elements.password.value || "");
    const passwordConfirm = String(confirmForm.elements.passwordConfirm.value || "");
    const email = pendingEmail || String(requestForm.elements.email.value || "").trim();

    if (code.length !== 6) {
      setStatus(confirmStatusEl, "인증코드 6자리를 입력해주세요.", "error");
      confirmForm.elements.code.focus();
      return;
    }

    if (password.length < 8) {
      setStatus(confirmStatusEl, "비밀번호는 8자 이상으로 입력해주세요.", "error");
      confirmForm.elements.password.focus();
      return;
    }

    if (password !== passwordConfirm) {
      setStatus(confirmStatusEl, "새 비밀번호와 비밀번호 확인이 일치하지 않습니다.", "error");
      confirmForm.elements.passwordConfirm.focus();
      return;
    }

    setButtonLoading(submitButton, true, "변경 중…");
    setStatus(confirmStatusEl, "");

    try {
      await requestJson("./api/auth/password-reset/confirm", {
        method: "POST",
        body: {
          email,
          code,
          password,
        },
      });

      window.location.href = "./account.html?auth=password-reset";
    } catch (error) {
      setStatus(confirmStatusEl, getFriendlyApiMessage(error, "비밀번호를 바꾸지 못했습니다. 잠시 후 다시 시도해주세요."), "error");
    } finally {
      setButtonLoading(submitButton, false, "변경 중…");
      confirmForm.elements.password.value = "";
      confirmForm.elements.passwordConfirm.value = "";
    }
  });
}