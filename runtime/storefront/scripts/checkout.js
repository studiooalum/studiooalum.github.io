/* =========================
   checkout.js — Order summary + form validation + address search
========================= */

import { imageUrl } from "./sanity/image.js";
import { removeFromCart, renderCartPanel, updateQty } from "./cart.js";
import { formatPrice } from "./utils/catalog.js";
import { CART_KEY, ORDER_KEY, readStoredJson, writeStoredJson } from "./utils/storage.js";

/* =========================
   CART DATA (read-only on this page)
========================= */

function getCart() {
  return readStoredJson(CART_KEY, []);
}

/* =========================
   RENDER ORDER SUMMARY
========================= */

function renderOrderSummary() {
  const items = getCart();
  const container = document.getElementById("checkoutItems");
  const submitButton = document.getElementById("submitOrderBtn");

  if (items.length === 0) {
    container.innerHTML = `<p class="checkout-empty">장바구니가 비어있습니다</p>`;
    submitButton.disabled = true;
    document.getElementById("checkoutSubtotal").textContent = formatPrice(0);
    document.getElementById("checkoutTotal").textContent = formatPrice(0);
    return;
  }

  submitButton.disabled = false;

  container.innerHTML = items.map((item) => {
    const imgSrc = item.image ? imageUrl(item.image, { width: 120 }) : "";
    const editionLabel = item.editionNumber ? ` #${String(item.editionNumber).padStart(2, "0")}` : "";
    return `
      <div class="checkout-item">
        ${imgSrc ? `<img class="checkout-item__img" src="${imgSrc}" alt="${item.title}" />` : ""}
        <div class="checkout-item__info">
          <div class="checkout-item__top">
            <div class="checkout-item__title">${item.title}${editionLabel}</div>
            <button type="button" class="checkout-item__remove" data-checkout-remove="${item.lineId || item._id}" aria-label="삭제">×</button>
          </div>
          <div class="checkout-item__meta">${formatPrice(item.price)}</div>
          <div class="checkout-item__controls">
            <div class="checkout-item__qty">
              <button type="button" class="checkout-item__qty-btn" data-checkout-qty="dec" data-id="${item.lineId || item._id}">−</button>
              <span class="checkout-item__qty-value">${item.qty}</span>
              <button type="button" class="checkout-item__qty-btn" data-checkout-qty="inc" data-id="${item.lineId || item._id}">+</button>
            </div>
          </div>
        </div>
        <div class="checkout-item__subtotal">${formatPrice(item.price * item.qty)}</div>
      </div>
    `;
  }).join("");

  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  document.getElementById("checkoutSubtotal").textContent = formatPrice(subtotal);
  document.getElementById("checkoutTotal").textContent = formatPrice(subtotal);
}

function setupSummaryControls() {
  const container = document.getElementById("checkoutItems");

  container.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-checkout-remove]");
    if (removeButton) {
      removeFromCart(removeButton.getAttribute("data-checkout-remove"));
      renderOrderSummary();
      renderCartPanel();
      return;
    }

    const qtyButton = event.target.closest("[data-checkout-qty]");
    if (!qtyButton) return;

    const itemId = qtyButton.getAttribute("data-id");
    const delta = qtyButton.getAttribute("data-checkout-qty") === "inc" ? 1 : -1;
    updateQty(itemId, delta);
    renderOrderSummary();
    renderCartPanel();
  });
}

/* =========================
   DAUM POSTCODE (Korean address search)
========================= */

function openAddressSearch() {
  new daum.Postcode({
    oncomplete(data) {
      document.getElementById("zipcode").value = data.zonecode;
      document.getElementById("address1").value = data.roadAddress || data.jibunAddress;
      document.getElementById("address2").focus();
    },
  }).open();
}

/* =========================
   DELIVERY MEMO — custom input toggle
========================= */

function setupMemo() {
  const memoSelect = document.getElementById("memo");
  const memoCustom = document.getElementById("memoCustom");

  memoSelect.addEventListener("change", () => {
    if (memoSelect.value === "custom") {
      memoCustom.style.display = "";
      memoCustom.focus();
    } else {
      memoCustom.style.display = "none";
      memoCustom.value = "";
    }
  });
}

/* =========================
   FORM VALIDATION + SUBMIT
========================= */

function setupForm() {
  const form = document.getElementById("checkoutForm");

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    // Basic client-side validation
    const name = form.name.value.trim();
    const phone = form.phone.value.trim();
    const email = form.email.value.trim();
    const zipcode = form.zipcode.value.trim();
    const address1 = form.address1.value.trim();
    const address2 = form.address2.value.trim();
    const memo = form.memo.value === "custom" ? form.memoCustom.value.trim() : form.memo.value;
    const agreed = form.querySelector("#agreeTerms").checked;

    if (!name || !phone || !email || !zipcode || !address1) {
      alert("필수 항목을 모두 입력해주세요.");
      return;
    }

    if (!agreed) {
      alert("이용약관 및 개인정보 처리방침에 동의해주세요.");
      return;
    }

    const orderData = {
      items: getCart(),
      shipping: { name, phone, email, zipcode, address1, address2, memo },
      total: getCart().reduce((sum, i) => sum + i.price * i.qty, 0),
      createdAt: new Date().toISOString(),
    };

    // Save order for the payment page to read
    writeStoredJson(ORDER_KEY, orderData);

    // Redirect to Toss payment page
    window.location.href = "./payment.html";
  });
}

/* =========================
   INIT
========================= */

renderOrderSummary();
setupSummaryControls();
setupMemo();
setupForm();

document.getElementById("searchZipBtn").addEventListener("click", openAddressSearch);
