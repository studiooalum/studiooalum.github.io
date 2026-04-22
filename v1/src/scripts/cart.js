/* =========================
   cart.js — localStorage cart + floating right-side panel
========================= */

import { imageUrl } from "./sanity/image.js";

const CART_KEY = "studiooalum_cart";

/* =========================
   CART DATA (localStorage)
========================= */

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch { return []; }
}

function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

function computeFinalPrice(product) {
  const price = Number(product.price) || 0;
  const discountRate = Number(product.discountRate) || 0;
  return discountRate > 0 ? Math.round(price * (1 - discountRate / 100)) : price;
}

export function addToCart(product) {
  const items = getCart();
  const lineId = product._id;
  const existing = items.find((i) => i.lineId === lineId);
  if (existing) {
    existing.qty += 1;
  } else {
    items.push({
      lineId,
      _id: product._id,
      title: product.title,
      price: computeFinalPrice(product),
      slug: product.slug?.current || product.slug || "",
      image: product.images?.[0] || null,
      qty: 1,
    });
  }
  saveCart(items);
  renderCartPanel();
  openCart();
}

/** 장바구니에 담되 패널을 열지 않음 (바로 결제용) */
export function addToCartSilent(product) {
  const items = getCart();
  const lineId = product._id;
  const existing = items.find((i) => i.lineId === lineId);
  if (existing) {
    existing.qty += 1;
  } else {
    items.push({
      lineId,
      _id: product._id,
      title: product.title,
      price: computeFinalPrice(product),
      slug: product.slug?.current || product.slug || "",
      image: product.images?.[0] || null,
      qty: 1,
    });
  }
  saveCart(items);
}

export function removeFromCart(id) {
  const items = getCart().filter((i) => (i.lineId || i._id) !== id);
  saveCart(items);
  renderCartPanel();
}

export function updateQty(id, delta) {
  const items = getCart();
  const item = items.find((i) => (i.lineId || i._id) === id);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  saveCart(items);
  renderCartPanel();
}

export function getCartCount() {
  return getCart().reduce((sum, i) => sum + i.qty, 0);
}

export function getCartTotal() {
  return getCart().reduce((sum, i) => sum + i.price * i.qty, 0);
}

/* =========================
   FORMAT HELPERS
========================= */

function formatPrice(n) {
  if (!n && n !== 0) return "";
  return "₩" + n.toLocaleString("ko-KR");
}

/* =========================
   CART PANEL DOM — injected once
========================= */

let panelEl = null;
let navListenerBound = false;

function bindCartTriggers() {
  document.querySelectorAll("[data-cart-toggle]").forEach((trigger) => {
    if (trigger.dataset.cartBound === "true") return;
    trigger.dataset.cartBound = "true";
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      toggleCart();
    });
  });
}

function syncCartBadges() {
  const count = getCartCount();
  document.querySelectorAll(".js-cart-count").forEach((badge) => {
    badge.textContent = String(count);
    badge.hidden = count === 0;
  });
}

function getCheckoutPathForCurrentPage() {
  return window.location.pathname.includes("/v1/") ? "./src/checkout.html" : "./checkout.html";
}

export function initCartUI() {
  bindCartTriggers();

  if (!navListenerBound) {
    navListenerBound = true;
    window.addEventListener("studiooalum:nav-updated", () => {
      bindCartTriggers();
      syncCartBadges();
    });
  }

  if (panelEl) {
    renderCartPanel();
    return;
  }

  // Cart panel (slides in from right)
  panelEl = document.createElement("aside");
  panelEl.className = "cart-panel";
  panelEl.innerHTML = `
    <div class="cart-panel__header">
      <h2 class="cart-panel__title">장바구니</h2>
      <button class="cart-panel__close" aria-label="닫기">&times;</button>
    </div>
    <div class="cart-panel__items" id="cartItems"></div>
    <div class="cart-panel__footer">
      <div class="cart-panel__total">
        <span>합계</span>
        <span id="cartTotal">₩0</span>
      </div>
      <a href="${getCheckoutPathForCurrentPage()}" class="cart-panel__checkout-btn" id="cartCheckoutBtn">주문하기</a>
    </div>
  `;
  document.body.appendChild(panelEl);

  // Backdrop
  const backdrop = document.createElement("div");
  backdrop.className = "cart-backdrop";
  backdrop.addEventListener("click", () => closeCart());
  document.body.appendChild(backdrop);

  panelEl.querySelector(".cart-panel__close").addEventListener("click", () => closeCart());

  renderCartPanel();
}

/** Alternate init for pages inside /src/ (adjust checkout link path) */
export function initCartUIFromSrc() {
  initCartUI();
  const checkoutBtn = document.getElementById("cartCheckoutBtn");
  if (checkoutBtn) checkoutBtn.href = "./checkout.html";
}

/* =========================
   RENDER CART PANEL
========================= */

export function renderCartPanel() {
  const items = getCart();
  const total = getCartTotal();

  syncCartBadges();
  bindCartTriggers();

  const container = document.getElementById("cartItems");
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `<p class="cart-panel__empty">장바구니가 비어있습니다</p>`;
  } else {
    container.innerHTML = items.map((item) => {
      const imgSrc = item.image ? imageUrl(item.image, { width: 120 }) : "";
      return `
        <div class="cart-item" data-id="${item.lineId || item._id}">
          ${imgSrc ? `<img class="cart-item__img" src="${imgSrc}" alt="${item.title}" />` : ""}
          <div class="cart-item__info">
            <div class="cart-item__title">${item.title}</div>
            <div class="cart-item__price">${formatPrice(item.price)}</div>
            <div class="cart-item__qty">
              <button class="cart-item__qty-btn" data-action="dec" data-id="${item.lineId || item._id}">−</button>
              <span>${item.qty}</span>
              <button class="cart-item__qty-btn" data-action="inc" data-id="${item.lineId || item._id}">+</button>
            </div>
          </div>
          <button class="cart-item__remove" data-id="${item.lineId || item._id}" aria-label="삭제">&times;</button>
        </div>
      `;
    }).join("");

    // Bind events via delegation
    container.querySelectorAll(".cart-item__qty-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const delta = btn.dataset.action === "inc" ? 1 : -1;
        updateQty(id, delta);
      });
    });
    container.querySelectorAll(".cart-item__remove").forEach((btn) => {
      btn.addEventListener("click", () => removeFromCart(btn.dataset.id));
    });
  }

  const totalEl = document.getElementById("cartTotal");
  if (totalEl) totalEl.textContent = formatPrice(total);
}

/* =========================
   OPEN / CLOSE / TOGGLE
========================= */

export function openCart() {
  document.body.classList.add("cart-open");
}

export function closeCart() {
  document.body.classList.remove("cart-open");
}

export function toggleCart() {
  document.body.classList.toggle("cart-open");
}
