const AUTH_KEY = "studiooalum_logged_in";

function resolvePath(path) {
  if (!path) return "#";
  if (/^(https?:|#|mailto:|tel:)/.test(path)) return path;
  return `./${path.replace(/^\.\//, "")}`;
}

function isLoggedIn() {
  return window.localStorage.getItem(AUTH_KEY) === "true";
}

function createActionLink({ href, label, className = "", attrs = "" }) {
  return `<a href="${href}" class="gnb__action ${className}" ${attrs}>${label}</a>`;
}

function createActionButton({ label, className = "", attrs = "" }) {
  return `<button type="button" class="gnb__action gnb__action--button ${className}" ${attrs}>${label}</button>`;
}

export function initSiteChrome({ title, backHref, backLabel } = {}) {
  const nav = document.querySelector(".gnb");
  if (!nav) return;

  const backEl = nav.querySelector(".gnb__back");
  const titleEl = nav.querySelector(".gnb__title");
  let actionsEl = nav.querySelector(".gnb__actions");

  if (backEl && backHref) backEl.href = resolvePath(backHref);
  if (backEl && backLabel) backEl.textContent = backLabel;
  if (titleEl && title) titleEl.textContent = title;

  if (!actionsEl) {
    actionsEl = document.createElement("div");
    actionsEl.className = "gnb__actions";
    nav.appendChild(actionsEl);
  }

  const loggedIn = isLoggedIn();
  const accountHref = resolvePath("account.html");

  actionsEl.innerHTML = loggedIn
    ? [
        createActionButton({ label: "Logout", attrs: 'data-auth-toggle="logout"' }),
        createActionLink({ href: accountHref, label: "Account" }),
        createActionButton({ label: 'Cart <span class="gnb__count js-cart-count" hidden>0</span>', className: "gnb__action--cart", attrs: 'data-cart-toggle="true"' }),
      ].join("")
    : [
        createActionButton({ label: "Login", attrs: 'data-auth-toggle="login"' }),
        createActionButton({ label: 'Cart <span class="gnb__count js-cart-count" hidden>0</span>', className: "gnb__action--cart", attrs: 'data-cart-toggle="true"' }),
      ].join("");

  actionsEl.querySelectorAll("[data-auth-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const mode = button.getAttribute("data-auth-toggle");
      window.localStorage.setItem(AUTH_KEY, mode === "login" ? "true" : "false");
      initSiteChrome({ title, backHref, backLabel });
      window.dispatchEvent(new Event("studiooalum:nav-updated"));
    });
  });
}