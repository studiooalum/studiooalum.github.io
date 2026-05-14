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
  const form = document.querySelector(".js-signup-form");
  const statusEl = document.querySelector(".js-signup-status");

  if (!form || !statusEl) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector("button[type='submit']");
    const fullName = String(form.elements.fullName.value || "").trim();
    const email = String(form.elements.email.value || "").trim();
    const password = String(form.elements.password.value || "");
    const passwordConfirm = String(form.elements.passwordConfirm.value || "");
    const privacyConsent = form.elements.privacyConsent.checked === true;
    const termsConsent = form.elements.termsConsent.checked === true;
    const marketingConsent = form.elements.marketingConsent.checked === true;

    if (password !== passwordConfirm) {
      setStatus(statusEl, "비밀번호와 비밀번호 확인이 일치하지 않습니다.", "error");
      form.elements.passwordConfirm.focus();
      return;
    }

    if (!privacyConsent || !termsConsent) {
      setStatus(statusEl, "필수 약관에 모두 동의해주세요.", "error");
      return;
    }

    setButtonLoading(submitButton, true, "가입 중…");

    try {
      await requestJson("./api/auth/signup", {
        method: "POST",
        body: {
          fullName,
          email,
          password,
          privacyConsent,
          termsConsent,
          marketingConsent,
        },
      });

      window.location.href = "./account.html?auth=signup-success";
    } catch (error) {
      setStatus(statusEl, error.message || "회원가입을 완료하지 못했습니다.", "error");
    } finally {
      setButtonLoading(submitButton, false, "가입 중…");
    }
  });
}