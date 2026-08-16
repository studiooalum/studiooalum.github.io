const TOKEN_KEY = "studiooalum:order-admin-access-token";
const EXPIRES_KEY = "studiooalum:order-admin-access-expires-at";
const token = sessionStorage.getItem(TOKEN_KEY) || "";

function redirectToLogin() {
  const next = `./${location.pathname.split("/").pop() || "admin.html"}${location.search}${location.hash}`;
  location.replace(`./admin-login.html?next=${encodeURIComponent(next)}`);
}

async function logout() {
  if (token) {
    await fetch("./api/orders/admin-session", {
      method: "DELETE",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(EXPIRES_KEY);
  redirectToLogin();
}

if (!token) {
  redirectToLogin();
} else {
  fetch("./api/orders/admin-session", {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  }).then((response) => {
    if (!response.ok) throw new Error("Unauthorized");
    document.documentElement.classList.remove("admin-session-pending");
    document.documentElement.classList.add("admin-session-ready");
    window.dispatchEvent(new CustomEvent("studiooalum:admin-session-ready", { detail: { token } }));
  }).catch(() => logout());
}

document.addEventListener("click", (event) => {
  if (event.target.closest(".js-admin-session-logout")) void logout();
});