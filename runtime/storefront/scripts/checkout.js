/* =========================
   checkout.js — Order summary + form validation + address search
========================= */

import { imageUrl } from "./sanity/image.js";
import { openSitePolicyPanel } from "./components/siteFooter.js?v=20260520-02";
import { removeFromCart, renderCartPanel, updateQty } from "./cart.js";
import { formatPrice } from "./utils/catalog.js";
import { CART_KEY, ORDER_KEY, readStoredJson, writeStoredJson } from "./utils/storage.js";

const ORDER_CREATE_ENDPOINT = "/api/orders";
const ACCOUNT_ENDPOINT = "./api/auth/account";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* =========================
   CART DATA (read-only on this page)
========================= */

function getCart() {
  return readStoredJson(CART_KEY, []);
}

function resolveCheckoutImageUrl(image) {
  if (!image) return "";
  if (Array.isArray(image)) return resolveCheckoutImageUrl(image[0]);
  if (typeof image === "string") return image;

  try {
    return imageUrl(image, { width: 120 }) || "";
  } catch {
    return typeof image?.asset?.url === "string" ? image.asset.url : "";
  }
}

function generateLocalOrderId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `OALUM-LOCAL-${timestamp}-${random}`.toUpperCase();
}

function buildOrderName(items) {
  if (!items || items.length === 0) return "주문 상품 없음";
  const first = items[0]?.title || "상품";
  if (items.length === 1) return first;
  return `${first} 외 ${items.length - 1}건`;
}

function buildLocalPreviewOrder(orderData) {
  return {
    ...orderData,
    orderId: generateLocalOrderId(),
    orderName: buildOrderName(orderData.items),
    providerMode: "local-preview",
    status: "created",
    paymentStatus: "pending",
  };
}

async function createPendingOrder(orderData) {
  let response;

  try {
    response = await fetch(ORDER_CREATE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderData),
    });
  } catch (error) {
    console.warn("Falling back to local pending order preview.", error);
    return buildLocalPreviewOrder(orderData);
  }

  if (response.status === 404 || response.status === 405) {
    console.warn("Order API is unavailable on this host. Falling back to local preview order.");
    return buildLocalPreviewOrder(orderData);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok || !payload?.order) {
    throw new Error(payload?.error || payload?.message || `Order API failed: ${response.status}`);
  }

  return {
    ...orderData,
    ...payload.order,
  };
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
    const imgSrc = resolveCheckoutImageUrl(item.image);
    const editionLabel = item.editionNumber ? ` #${String(item.editionNumber).padStart(2, "0")}` : "";
    return `
      <div class="checkout-item">
        ${imgSrc ? `<img class="checkout-item__img" src="${imgSrc}" alt="${item.title}" />` : '<span class="checkout-item__fallback" aria-hidden="true"></span>'}
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

function getEmailFieldElements() {
  return {
    localInput: document.getElementById("emailLocal"),
    domainSelect: document.getElementById("emailDomainSelect"),
    customDomainInput: document.getElementById("emailDomainCustom"),
    emailInput: document.getElementById("email"),
  };
}

function syncEmailCompositeField() {
  const {
    localInput,
    domainSelect,
    customDomainInput,
    emailInput,
  } = getEmailFieldElements();

  if (!localInput || !domainSelect || !customDomainInput || !emailInput) {
    return "";
  }

  const localPart = String(localInput.value || "").trim();
  const selectedDomain = String(domainSelect.value || "").trim();
  const domain = selectedDomain === "custom"
    ? String(customDomainInput.value || "").trim()
    : selectedDomain;
  const email = localPart && domain ? `${localPart}@${domain}` : "";

  customDomainInput.hidden = selectedDomain !== "custom";
  if (selectedDomain !== "custom") {
    customDomainInput.value = "";
  }

  emailInput.value = email;
  return email;
}

function applyEmailCompositeValue(email) {
  const {
    localInput,
    domainSelect,
    customDomainInput,
    emailInput,
  } = getEmailFieldElements();

  if (!localInput || !domainSelect || !customDomainInput || !emailInput) {
    return;
  }

  const normalized = String(email || "").trim();
  if (!normalized.includes("@")) {
    localInput.value = normalized;
    domainSelect.value = "";
    customDomainInput.value = "";
    emailInput.value = "";
    customDomainInput.hidden = true;
    return;
  }

  const atIndex = normalized.indexOf("@");
  const localPart = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  const optionExists = Array.from(domainSelect.options).some((option) => option.value === domain);

  localInput.value = localPart;
  if (optionExists) {
    domainSelect.value = domain;
    customDomainInput.value = "";
  } else {
    domainSelect.value = "custom";
    customDomainInput.value = domain;
  }

  customDomainInput.hidden = domainSelect.value !== "custom";
  emailInput.value = normalized;
}

function setupEmailField() {
  const {
    localInput,
    domainSelect,
    customDomainInput,
  } = getEmailFieldElements();

  if (!localInput || !domainSelect || !customDomainInput) {
    return;
  }

  const handleSync = () => {
    syncEmailCompositeField();
    if (!customDomainInput.hidden && !customDomainInput.value.trim()) {
      customDomainInput.focus();
    }
  };

  localInput.addEventListener("input", handleSync);
  domainSelect.addEventListener("change", handleSync);
  customDomainInput.addEventListener("input", handleSync);

  syncEmailCompositeField();
}

function setupPolicyLinks() {
  document.querySelectorAll("[data-checkout-policy]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openSitePolicyPanel(button.dataset.checkoutPolicy, button);
    });
  });
}

function setCheckoutAuthState({ authenticated, message, detail }) {
  const headlineEl = document.getElementById("checkoutAuthHeadline");
  const copyEl = document.getElementById("checkoutAuthCopy");
  const linkEl = document.getElementById("checkoutAuthLink");
  const saveFieldEl = document.getElementById("checkoutSaveAddressField");

  if (!headlineEl || !copyEl || !linkEl || !saveFieldEl) {
    return;
  }

  headlineEl.textContent = message;
  copyEl.textContent = detail;
  saveFieldEl.hidden = !authenticated;

  if (authenticated) {
    linkEl.textContent = "계정 보기";
  } else {
    linkEl.textContent = "로그인 / 회원가입";
  }
}

function fillShippingForm(user) {
  const form = document.getElementById("checkoutForm");
  if (!form || !user) return;

  if (user.fullName && !form.name.value.trim()) {
    form.name.value = user.fullName;
  }

  if (user.phone && !form.phone.value.trim()) {
    form.phone.value = user.phone;
  }

  if (user.email && !form.email.value.trim()) {
    applyEmailCompositeValue(user.email);
  }

  if (user.zipcode && !form.zipcode.value.trim()) {
    form.zipcode.value = user.zipcode;
  }

  if (user.address1 && !form.address1.value.trim()) {
    form.address1.value = user.address1;
  }

  if (user.address2 && !form.address2.value.trim()) {
    form.address2.value = user.address2;
  }
}

async function loadCheckoutAccount() {
  try {
    const response = await fetch(ACCOUNT_ENDPOINT, {
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) {
        throw Object.assign(new Error("guest"), { status: 401 });
      }
      throw new Error(payload?.error || `Account API failed: ${response.status}`);
    }

    fillShippingForm(payload?.account?.user || null);
    setCheckoutAuthState({
      authenticated: true,
      message: "회원 주문으로 진행 중입니다.",
      detail: "저장된 기본 주소를 불러왔습니다. 필요하면 수정 후 결제해주세요.",
    });
  } catch (error) {
    if (error?.status === 401 || error?.message === "guest") {
      setCheckoutAuthState({
        authenticated: false,
        message: "비회원 주문이 가능합니다.",
        detail: "로그인하면 기본 주소와 주문 내역을 계정에 연결할 수 있습니다.",
      });
      return;
    }

    console.error("Failed to load checkout account.", error);
    setCheckoutAuthState({
      authenticated: false,
      message: "비회원 주문이 가능합니다.",
      detail: "계정 정보를 불러오지 못해도 비회원 주문은 계속 진행할 수 있습니다.",
    });
  }
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

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Basic client-side validation
    const name = form.name.value.trim();
    const phone = form.phone.value.trim();
    const email = syncEmailCompositeField().trim();
    const zipcode = form.zipcode.value.trim();
    const address1 = form.address1.value.trim();
    const address2 = form.address2.value.trim();
    const memo = form.memo.value === "custom" ? form.memoCustom.value.trim() : form.memo.value;
    const saveAsDefaultAddress = form.saveAsDefaultAddress?.checked === true;
    const agreedTermsPrivacy = form.querySelector("#agreeTermsPrivacy")?.checked === true;

    if (!name || !phone || !email || !zipcode || !address1) {
      alert("필수 항목을 모두 입력해주세요.");
      return;
    }

    if (!EMAIL_REGEX.test(email)) {
      alert("이메일 주소를 다시 확인해주세요.");
      return;
    }

    if (!agreedTermsPrivacy) {
      alert("이용약관 및 개인정보 처리방침 동의가 필요합니다.");
      return;
    }

    const orderData = {
      items: getCart(),
      shipping: { name, phone, email, zipcode, address1, address2, memo },
      saveAsDefaultAddress,
      total: getCart().reduce((sum, i) => sum + i.price * i.qty, 0),
      createdAt: new Date().toISOString(),
    };

    try {
      const pendingOrder = await createPendingOrder(orderData);

      // Save order for the payment page to read
      writeStoredJson(ORDER_KEY, pendingOrder);

      // Redirect to Toss payment page
      window.location.href = "./payment.html";
    } catch (error) {
      console.error("Order creation error:", error);
      alert(error.message || "주문 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  });
}

/* =========================
   INIT
========================= */

renderOrderSummary();
setupEmailField();
setupSummaryControls();
setupMemo();
setupPolicyLinks();
setupForm();
loadCheckoutAccount();

document.getElementById("searchZipBtn").addEventListener("click", openAddressSearch);
