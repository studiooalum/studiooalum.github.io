const PRIMARY_NAV_ITEMS = [
  { key: "archive", label: "ARCHIVE", href: "archive.html" },
  { key: "shop", label: "SHOP", href: "shop.html" },
  { key: "workshops", label: "WORKSHOPS", href: "workshops.html" },
  { key: "newsletter", label: "NEWSLETTER", href: "newsletter.html" },
];

let authState = {
  resolved: false,
  authenticated: false,
};

let authStateRequest = null;

function resolvePath(path) {
  if (!path) return "#";
  if (/^(https?:|#|mailto:|tel:)/.test(path)) return path;
  return `./${path.replace(/^\.\//, "")}`;
}

async function readAuthState({ force = false } = {}) {
  if (!force && authState.resolved) {
    return authState;
  }

  if (!force && authStateRequest) {
    return authStateRequest;
  }

  authStateRequest = fetch(resolvePath("api/auth/session"), {
    headers: {
      Accept: "application/json",
    },
    credentials: "same-origin",
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Auth session request failed with status ${response.status}.`);
      }

      const payload = await response.json();
      authState = {
        resolved: true,
        authenticated: Boolean(payload?.authenticated),
      };

      return authState;
    })
    .catch((error) => {
      console.error("Failed to read auth session.", error);
      authState = {
        resolved: true,
        authenticated: false,
      };
      return authState;
    })
    .finally(() => {
      authStateRequest = null;
    });

  return authStateRequest;
}

function createActionLink({ href, label, className = "", attrs = "" }) {
  return `<a href="${href}" class="gnb__action ${className}" ${attrs}>${label}</a>`;
}

function createActionButton({ label, className = "", attrs = "" }) {
  return `<button type="button" class="gnb__action gnb__action--button ${className}" ${attrs}>${label}</button>`;
}

function getUserIconMarkup() {
  return `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="12" cy="8.2" r="3.3" stroke="currentColor" stroke-width="1.4"/>
      <path d="M5.5 18.5C7 15.7 9.25 14.3 12 14.3C14.75 14.3 17 15.7 18.5 18.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </svg>
  `;
}

function getCartIconMarkup() {
  return `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M4 5.5H6.2L8 14.5H17.2L19 8H8.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="10.2" cy="18.3" r="1.15" fill="currentColor"/>
      <circle cx="16.9" cy="18.3" r="1.15" fill="currentColor"/>
    </svg>
  `;
}

function getSectionKey(nav) {
  for (const key of PRIMARY_NAV_ITEMS.map((item) => item.key)) {
    if (nav.classList.contains(`gnb--${key}`)) return key;
  }
  return "shop";
}

function createPrimaryNavItemsMarkup(activeKey, className = "gnb__menu-item") {
  return PRIMARY_NAV_ITEMS.map(({ key, label, href }) => {
    const active = key === activeKey;
    return `<a href="${resolvePath(href)}" class="${className}${active ? " is-active" : ""}"${active ? ' aria-current="page"' : ""}>${label}</a>`;
  }).join("");
}

function createPrimaryNavMarkup(activeKey) {
  const items = createPrimaryNavItemsMarkup(activeKey);
  const mobileUtilities = createMobileUtilitiesMarkup(authState.authenticated);

  return `
    <div class="gnb__primary">
      <button type="button" class="gnb__menu-toggle" data-nav-toggle="true" aria-label="메뉴 열기" aria-controls="gnbMobilePanel" aria-expanded="false">
        <span></span>
        <span></span>
        <span></span>
      </button>
      <a href="${resolvePath("index.html")}" class="gnb__home" aria-label="Home">
        <img src="${resolvePath("oalum_favicon.png")}" class="gnb__home-logo" alt="">
      </a>
      ${mobileUtilities}
      <div class="gnb__menu" aria-label="Primary">${items}</div>
    </div>
  `;
}

function createMobileNavMarkup(activeKey, { showActions = true } = {}) {
  return `
    <div class="gnb__mobile-backdrop" data-nav-close="true"></div>
    <div class="gnb__mobile-panel" id="gnbMobilePanel" aria-label="Mobile navigation">
      <div class="gnb__mobile-menu">${createPrimaryNavItemsMarkup(activeKey, "gnb__mobile-item")}</div>
      ${showActions && authState.authenticated ? `<div class="gnb__mobile-actions">${createActionButton({ label: "Logout", attrs: 'data-auth-toggle="logout"' })}</div>` : ""}
    </div>
  `;
}

function createMobileUtilitiesMarkup(loggedIn) {
  const accountHref = resolvePath("account.html");
  const accountLabel = loggedIn ? "Account" : "Login";

  return `
    <div class="gnb__mobile-utilities" aria-label="Quick actions">
      <a href="${accountHref}" class="gnb__mobile-utility gnb__mobile-utility--account" aria-label="${accountLabel}">
        ${getUserIconMarkup()}
      </a>
      <button type="button" class="gnb__mobile-utility gnb__mobile-utility--cart" aria-label="Cart" data-cart-toggle="true">
        ${getCartIconMarkup()}
        <span class="gnb__count gnb__count--mobile js-cart-count" hidden>0</span>
      </button>
    </div>
  `;
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
        createActionLink({ href: accountHref, label: "Login" }),
        createActionButton({ label: 'Cart <span class="gnb__count js-cart-count" hidden>0</span>', className: "gnb__action--cart", attrs: 'data-cart-toggle="true"' }),
      ].join("");
}

function renderSiteChrome(nav, { showActions = true } = {}) {
  const sectionKey = getSectionKey(nav);
  const loggedIn = authState.authenticated;

  nav.classList.remove("is-menu-open");
  document.body.classList.remove("gnb-menu-open");

  nav.innerHTML = `
    ${createPrimaryNavMarkup(sectionKey)}
    ${showActions ? `<div class="gnb__actions">${createActionsMarkup(loggedIn)}</div>` : ""}
    ${createMobileNavMarkup(sectionKey, { showActions })}
  `;
}

async function logout() {
  const response = await fetch(resolvePath("api/auth/logout"), {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error(`Logout request failed with status ${response.status}.`);
  }

  authState = {
    resolved: true,
    authenticated: false,
  };
}

function bindAuthActions(nav, options) {
  nav.querySelectorAll("[data-auth-toggle='logout']").forEach((button) => {
    if (button.dataset.authBound === "true") return;
    button.dataset.authBound = "true";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      button.disabled = true;

      try {
        await logout();
        renderSiteChrome(nav, options);
        bindAuthActions(nav, options);
        window.dispatchEvent(new Event("studiooalum:auth-changed"));
        window.dispatchEvent(new Event("studiooalum:nav-updated"));
      } catch (error) {
        console.error("Failed to log out.", error);
        button.disabled = false;
      }
    });
  });
}

function setMobileMenuOpen(nav, isOpen) {
  nav.classList.toggle("is-menu-open", isOpen);
  document.body.classList.toggle("gnb-menu-open", isOpen);
  nav.querySelector("[data-nav-toggle='true']")?.setAttribute("aria-expanded", String(isOpen));
}

function bindMobileMenu(nav) {
  const toggle = nav.querySelector("[data-nav-toggle='true']");

  toggle?.addEventListener("click", () => {
    const nextOpen = !nav.classList.contains("is-menu-open");
    setMobileMenuOpen(nav, nextOpen);
  });

  nav.querySelectorAll("[data-nav-close='true'], .gnb__mobile-menu a, .gnb__mobile-actions a, .gnb__mobile-actions [data-cart-toggle], .gnb__mobile-actions [data-auth-toggle='logout']").forEach((target) => {
    target.addEventListener("click", () => {
      setMobileMenuOpen(nav, false);
    });
  });

  if (nav.dataset.mobileMenuBound === "true") {
    return;
  }

  nav.dataset.mobileMenuBound = "true";

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      setMobileMenuOpen(nav, false);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setMobileMenuOpen(nav, false);
    }
  });
}

function refreshSiteChrome(nav, options, { force = false } = {}) {
  renderSiteChrome(nav, options);
  bindAuthActions(nav, options);
  bindMobileMenu(nav);
  window.dispatchEvent(new Event("studiooalum:nav-updated"));

  return readAuthState({ force }).then(() => {
    if (!nav.isConnected) return;
    renderSiteChrome(nav, options);
    bindAuthActions(nav, options);
    bindMobileMenu(nav);
    window.dispatchEvent(new Event("studiooalum:nav-updated"));
  });
}

export function initSiteChrome({ showActions = true, title = "" } = {}) {
  const nav = document.querySelector(".gnb");
  if (!nav) return;

  const options = { showActions, title };
  refreshSiteChrome(nav, options);

  if (nav.dataset.authSyncBound === "true") {
    return;
  }

  nav.dataset.authSyncBound = "true";
  window.addEventListener("studiooalum:auth-changed", () => {
    authState = {
      resolved: false,
      authenticated: false,
    };
    refreshSiteChrome(nav, options, { force: true });
  });
}