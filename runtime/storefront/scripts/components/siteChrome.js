const AUTH_KEY = "studiooalum_logged_in";

const PRIMARY_NAV_ITEMS = [
  { key: "archive", label: "ARCHIVE", href: "archive.html" },
  { key: "shop", label: "SHOP", href: "shop.html" },
  { key: "workshops", label: "WORKSHOPS", href: "workshops.html" },
  { key: "newsletter", label: "NEWSLETTER", href: "newsletter.html" },
];

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

function getSectionKey(nav) {
  for (const key of PRIMARY_NAV_ITEMS.map((item) => item.key)) {
    if (nav.classList.contains(`gnb--${key}`)) return key;
  }
  return "shop";
}

function createPrimaryNavMarkup(activeKey) {
  const items = PRIMARY_NAV_ITEMS.map(({ key, label, href }) => {
    const active = key === activeKey;
    return `<a href="${resolvePath(href)}" class="gnb__menu-item${active ? " is-active" : ""}"${active ? ' aria-current="page"' : ""}>${label}</a>`;
  }).join("");

  return `
    <div class="gnb__primary">
      <a href="${resolvePath("index.html")}" class="gnb__home" aria-label="Home">
        <img src="${resolvePath("oalum_favicon.png")}" class="gnb__home-logo" alt="">
      </a>
      <div class="gnb__menu" aria-label="Primary">${items}</div>
    </div>
  `;
}

function createTitleMarkup(title) {
  return `<span class="gnb__title">${title || ""}</span>`;
}

function createActionsMarkup(loggedIn) {
  const accountHref = resolvePath("account.html");

  return loggedIn
    ? [
        createActionButton({ label: "Logout", attrs: 'data-auth-toggle="logout"' }),
        createActionLink({ href: accountHref, label: "Account" }),
        createActionButton({ label: 'Cart <span class="gnb__count js-cart-count" hidden>0</span>', className: "gnb__action--cart", attrs: 'data-cart-toggle="true"' }),
      ].join("")
    : [
        createActionButton({ label: "Login", attrs: 'data-auth-toggle="login"' }),
        createActionButton({ label: 'Cart <span class="gnb__count js-cart-count" hidden>0</span>', className: "gnb__action--cart", attrs: 'data-cart-toggle="true"' }),
      ].join("");
}

export function initSiteChrome({ showActions = true, title = "" } = {}) {
  const nav = document.querySelector(".gnb");
  if (!nav) return;

  const sectionKey = getSectionKey(nav);
  const loggedIn = isLoggedIn();
  const existingTitle = nav.querySelector(".gnb__title")?.textContent?.trim() || "";
  const titleText = title || existingTitle;

  nav.innerHTML = `
    ${createPrimaryNavMarkup(sectionKey)}
    ${createTitleMarkup(titleText)}
    ${showActions ? `<div class="gnb__actions">${createActionsMarkup(loggedIn)}</div>` : ""}
  `;

  nav.querySelectorAll("[data-auth-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const mode = button.getAttribute("data-auth-toggle");
      window.localStorage.setItem(AUTH_KEY, mode === "login" ? "true" : "false");
      initSiteChrome({ showActions, title: titleText });
      window.dispatchEvent(new Event("studiooalum:nav-updated"));
    });
  });
}