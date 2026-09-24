/* =========================
   payment.js — Toss Payment Widget integration
   Reads order data from localStorage, renders Toss widget, handles payment request.
========================= */

import { formatPrice } from "./utils/catalog.js";
import { ORDER_KEY, readStoredJson, writeStoredJson } from "./utils/storage.js";

// ---- Constants ----

/* =========================
   READ ORDER DATA
========================= */

function getPendingOrder() {
  return readStoredJson(ORDER_KEY, null);
}

function generateOrderId() {
  // Toss requires orderId to be between 6-64 chars, alphanumeric + hyphen/underscore
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `OALUM-${ts}-${rand}`;
}

async function getPaymentConfig() {
  const response = await fetch("./api/payments/config", { headers: { Accept: "application/json" } });
  const config = await response.json();
  if (!response.ok || !config.ok) throw new Error(config.error || "결제 설정이 준비되지 않았습니다.");
  return config;
}

/* =========================
   BUILD ORDER NAME (e.g. "Hand-tufted Rug 외 2건")
========================= */

function buildOrderName(items) {
  if (!items || items.length === 0) return "주문 상품 없음";
  const first = items[0].title || "상품";
  if (items.length === 1) return first;
  return `${first} 외 ${items.length - 1}건`;
}

function buildPageUrl(fileName) {
  return new URL(`./${fileName}`, window.location.href).toString();
}

function renderOrderBenefits(order) {
  const wrapper = document.getElementById("paymentOrderBenefits");
  const couponEl = document.getElementById("paymentOrderCoupon");
  const pointsEl = document.getElementById("paymentOrderPoints");

  if (!wrapper || !couponEl || !pointsEl) {
    return;
  }

  const couponDiscount = Number(order?.coupon?.discountAmount || 0);
  const pointsUsed = Number(order?.pointsUsed || 0);

  couponEl.hidden = couponDiscount <= 0;
  pointsEl.hidden = pointsUsed <= 0;

  if (couponDiscount > 0) {
    couponEl.textContent = `쿠폰 ${order.coupon.code || ""} 적용 · -${formatPrice(couponDiscount)}`;
  }

  if (pointsUsed > 0) {
    pointsEl.textContent = `포인트 사용 · -${formatPrice(pointsUsed)}`;
  }

  wrapper.hidden = couponEl.hidden && pointsEl.hidden;
}

/* =========================
   INIT TOSS PAYMENT WIDGET
========================= */

async function initPayment() {
  const order = getPendingOrder();
  if (!order || !order.items || order.items.length === 0) {
    document.querySelector(".payment-layout").innerHTML = `
      <div class="payment-empty">
        <p>주문 정보가 없습니다.</p>
        <a href="./checkout.html">주문서로 돌아가기</a>
      </div>`;
    return;
  }

  // Display brief order info
  const orderName = order.orderName || buildOrderName(order.items);
  document.getElementById("paymentOrderName").textContent = orderName;
  document.getElementById("paymentOrderTotal").textContent = formatPrice(order.total);
  renderOrderBenefits(order);

  // ---- Toss Payments SDK ----
  // TossPayments is loaded globally from the CDN script tag
  if (typeof TossPayments === "undefined") {
    alert("결제 SDK를 불러오지 못했습니다. 페이지를 새로고침 해주세요.");
    return;
  }

  const config = await getPaymentConfig();
  const tossPayments = TossPayments(config.clientKey);
  const paymentOrderId = order.orderId;
  if (!paymentOrderId || !order.persisted) throw new Error("주문서에서 주문을 다시 확인해주세요.");

  writeStoredJson(ORDER_KEY, {
    ...order,
    orderId: paymentOrderId,
    orderName,
  });

  // Use anonymous customer (no login required)
  const widgets = tossPayments.widgets({
    customerKey: TossPayments.ANONYMOUS,
  });

  // Set the payment amount
  await widgets.setAmount({
    currency: "KRW",
    value: order.total,
  });

  // Render payment methods + agreement in parallel
  await Promise.all([
    widgets.renderPaymentMethods({
      selector: "#payment-method",
      variantKey: config.paymentVariantKey,
    }),
    widgets.renderAgreement({
      selector: "#agreement",
      variantKey: config.agreementVariantKey,
    }),
  ]);

  // Enable the pay button once widgets are rendered
  const payBtn = document.getElementById("payment-request-button");
  payBtn.disabled = false;

  // ---- Pay button click ----
  payBtn.addEventListener("click", async () => {
    payBtn.disabled = true;
    payBtn.textContent = "처리 중…";

    try {
      await widgets.requestPayment({
        orderId: paymentOrderId,
        orderName,
        successUrl: buildPageUrl("success.html"),
        failUrl: buildPageUrl("fail.html"),
        customerEmail:       order.shipping.email,
        customerName:        order.shipping.name,
        ...(/^01\d{8,9}$/.test(order.shipping.phone.replace(/\D/g, "")) ? { customerMobilePhone: order.shipping.phone.replace(/\D/g, "") } : {}),
      });
    } catch (err) {
      // User cancelled or SDK error
      console.error("Payment error:", err);
      payBtn.disabled = false;
      payBtn.textContent = "결제하기";
    }
  });
}

initPayment().catch((error) => {
  const layout = document.querySelector(".payment-layout");
  const message = document.createElement("p");
  message.className = "payment-empty";
  message.textContent = error.message || "결제를 준비하지 못했습니다.";
  layout.replaceChildren(message);
});
