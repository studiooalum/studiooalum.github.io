const TOKEN_KEY = "studiooalum:order-admin-access-token";
const EXPIRES_KEY = "studiooalum:order-admin-access-expires-at";
const form = document.querySelector(".js-admin-login-form");
const status = document.querySelector(".js-admin-login-status");

function getNextPath() {
  const value = String(new URLSearchParams(location.search).get("next") || "./admin.html");
  return /^\.\/[a-z0-9-]+\.html(?:[?#].*)?$/i.test(value) ? value : "./admin.html";
}

async function verifyStoredSession() {
  const token = sessionStorage.getItem(TOKEN_KEY) || "";
  if (!token) return false;
  const response = await fetch("./api/orders/admin-session", {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  return response.ok;
}

verifyStoredSession().then((valid) => {
  if (valid) location.replace(getNextPath());
}).catch(() => {});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button[type='submit']");
  const adminSecret = String(form.elements.adminSecret.value || "").trim();
  if (!adminSecret) return;
  button.disabled = true;
  status.textContent = "관리자 세션을 확인하는 중입니다.";
  status.classList.remove("is-error");

  try {
    const response = await fetch("./api/orders/admin-session", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ adminSecret }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.accessToken) throw new Error(payload?.error || "관리자 로그인에 실패했습니다.");
    sessionStorage.setItem(TOKEN_KEY, payload.accessToken);
    sessionStorage.removeItem(EXPIRES_KEY);
    location.replace(getNextPath());
  } catch (error) {
    status.textContent = error.message || "관리자 로그인에 실패했습니다.";
    status.classList.add("is-error");
    button.disabled = false;
  }
});