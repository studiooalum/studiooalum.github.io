/* =========================
   payment.js — Toss Payment Widget integration
   Reads order data from localStorage, renders Toss widget, handles payment request.
========================= */

// ---- Constants ----
// TODO: Replace with your live client key for production
const CLIENT_KEY = "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm";
const ORDER_KEY  = "studiooalum_pending_order";

/* =========================
   READ ORDER DATA
========================= */

function getPendingOrder() {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY)); }
  catch { return null; }
}

function formatPrice(n) {
  if (!n && n !== 0) return "₩0";
  return "₩" + n.toLocaleString("ko-KR");
}

function generateOrderId() {
  // Toss requires orderId to be between 6-64 chars, alphanumeric + hyphen/underscore
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `OALUM-${ts}-${rand}`;
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
  const orderName = buildOrderName(order.items);
  document.getElementById("paymentOrderName").textContent = orderName;
  document.getElementById("paymentOrderTotal").textContent = formatPrice(order.total);

  // ---- Toss Payments SDK ----
  // TossPayments is loaded globally from the CDN script tag
  if (typeof TossPayments === "undefined") {
    alert("결제 SDK를 불러오지 못했습니다. 페이지를 새로고침 해주세요.");
    return;
  }

  const tossPayments = TossPayments(CLIENT_KEY);

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
      variantKey: "DEFAULT",
    }),
    widgets.renderAgreement({
      selector: "#agreement",
      variantKey: "AGREEMENT",
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
        orderId: generateOrderId(),
        orderName,
        successUrl: window.location.origin + "/src/success.html",
        failUrl:    window.location.origin + "/src/fail.html",
        customerEmail:       order.shipping.email,
        customerName:        order.shipping.name,
        customerMobilePhone: order.shipping.phone.replace(/-/g, ""),
      });
    } catch (err) {
      // User cancelled or SDK error
      console.error("Payment error:", err);
      payBtn.disabled = false;
      payBtn.textContent = "결제하기";
    }
  });
}

initPayment();
