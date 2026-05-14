/* =========================
   success.js — Payment confirmation page
   Reads paymentKey, orderId, amount from URL params.
   Calls confirmation API to finalize payment.
========================= */

import { CART_KEY, ORDER_KEY, readStoredJson } from "./utils/storage.js";

// ---- Read URL params from Toss redirect ----
const urlParams  = new URLSearchParams(window.location.search);
const paymentKey = urlParams.get("paymentKey");
const orderId    = urlParams.get("orderId");
const amount     = urlParams.get("amount");
const PAYMENT_CONFIRM_ENDPOINT = "/api/payments/confirm";
const pendingOrder = readStoredJson(ORDER_KEY, null);

// ---- DOM refs ----
const loadingSection = document.getElementById("confirmLoading");
const successSection = document.getElementById("confirmSuccess");
const errorSection   = document.getElementById("confirmError");

/* =========================
   CONFIRM PAYMENT
   In production, this should call YOUR backend which then calls Toss's
   confirmation API with the secret key. The secret key must never be
   exposed client-side.

  In the current static Pages environment, this endpoint will usually be absent
  and a preview order can still bypass confirmation only when the current host
  does not provide the backend route.
========================= */

function canUsePreviewFallback() {
  const providerMode = String(pendingOrder?.providerMode || "").trim();
  return providerMode === "local-preview" || providerMode === "preview-no-db";
}

async function confirmPayment() {
  try {
    // ---- Production: call your backend ----
    // const response = await fetch("https://your-backend.com/api/payments/confirm", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ paymentKey, orderId, amount }),
    // });

    const response = await fetch(PAYMENT_CONFIRM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });

    if ((response.status === 404 || response.status === 405) && canUsePreviewFallback()) {
      showSuccess();
      return;
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || payload?.message || `Confirm failed: ${response.status}`);
    }

    // Payment confirmed — show success UI
    showSuccess(payload.payment);
  } catch (err) {
    console.error("Payment confirmation error:", err);

    if (err?.name === "TypeError" && canUsePreviewFallback()) {
      showSuccess();
      return;
    }

    showError(err?.message || "결제 확인에 실패했습니다. 관리자에게 문의해주세요.");
  }
}

/* =========================
   UI STATES
========================= */

function showSuccess(payment = null) {
  loadingSection.style.display = "none";
  errorSection.style.display   = "none";
  successSection.style.display = "flex";

  const confirmedAmount = payment?.amount ?? amount;
  const confirmedOrderId = payment?.orderId ?? orderId;
  const confirmedPaymentKey = payment?.paymentKey ?? paymentKey;

  document.getElementById("resultAmount").textContent     = confirmedAmount ? `₩${Number(confirmedAmount).toLocaleString("ko-KR")}` : "—";
  document.getElementById("resultOrderId").textContent    = confirmedOrderId || "—";
  document.getElementById("resultPaymentKey").textContent = confirmedPaymentKey || "—";

  // Clear cart and pending order after successful payment
  localStorage.removeItem(CART_KEY);
  localStorage.removeItem(ORDER_KEY);
}

function showError(message) {
  loadingSection.style.display = "none";
  successSection.style.display = "none";
  errorSection.style.display   = "flex";

  document.getElementById("confirmErrorMsg").textContent = message || "알 수 없는 오류가 발생했습니다.";
}

/* =========================
   INIT
========================= */

// If no payment params, something went wrong
if (!paymentKey || !orderId || !amount) {
  showError("결제 정보가 올바르지 않습니다.");
} else {
  // Auto-confirm (or wait for button click)
  const confirmBtn = document.getElementById("confirmPaymentButton");
  confirmBtn.addEventListener("click", confirmPayment);
}
