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

export function addToCart(product) {
  const items = getCart();
  const existing = items.find((i) => i._id === product._id);
  if (existing) {
    existing.qty += 1;
  } else {
    items.push({
      _id: product._id,
      title: product.title,
      price: product.price,
      slug: product.slug?.current || product.slug || "",
      image: product.images?.[0] || null,
      qty: 1,
    });
  }
  saveCart(items);
  renderCartPanel();
  openCart();
}

export function removeFromCart(id) {
  const items = getCart().filter((i) => i._id !== id);
  saveCart(items);
  renderCartPanel();
}

export function updateQty(id, delta) {
  const items = getCart();
  const item = items.find((i) => i._id === id);
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
let badgeEl = null;

export function initCartUI() {
  // Cart toggle button (fixed, right side)
  const toggleBtn = document.createElement("button");
  toggleBtn.className = "cart-toggle";
  toggleBtn.setAttribute("aria-label", "장바구니 열기");
  toggleBtn.innerHTML = `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
    <span class="cart-toggle__badge" id="cartBadge">0</span>
  `;
  document.body.appendChild(toggleBtn);
  badgeEl = document.getElementById("cartBadge");

  toggleBtn.addEventListener("click", () => toggleCart());

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
      <a href="./src/checkout.html" class="cart-panel__checkout-btn" id="cartCheckoutBtn">주문하기</a>
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
  const count = getCartCount();
  const total = getCartTotal();

  if (badgeEl) {
    badgeEl.textContent = count;
    badgeEl.style.display = count > 0 ? "" : "none";
  }

  const container = document.getElementById("cartItems");
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `<p class="cart-panel__empty">장바구니가 비어있습니다</p>`;
  } else {
    container.innerHTML = items.map((item) => {
      const imgSrc = item.image ? imageUrl(item.image, { width: 120 }) : "";
      return `
        <div class="cart-item" data-id="${item._id}">
          ${imgSrc ? `<img class="cart-item__img" src="${imgSrc}" alt="${item.title}" />` : ""}
          <div class="cart-item__info">
            <div class="cart-item__title">${item.title}</div>
            <div class="cart-item__price">${formatPrice(item.price)}</div>
            <div class="cart-item__qty">
              <button class="cart-item__qty-btn" data-action="dec" data-id="${item._id}">−</button>
              <span>${item.qty}</span>
              <button class="cart-item__qty-btn" data-action="inc" data-id="${item._id}">+</button>
            </div>
          </div>
          <button class="cart-item__remove" data-id="${item._id}" aria-label="삭제">&times;</button>
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
