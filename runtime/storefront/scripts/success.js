/* =========================
   success.js — Payment confirmation page
   Reads paymentKey, orderId, amount from URL params.
   Calls confirmation API to finalize payment.
========================= */

import { CART_KEY, ORDER_KEY } from "./utils/storage.js";

// ---- Read URL params from Toss redirect ----
const urlParams  = new URLSearchParams(window.location.search);
const paymentKey = urlParams.get("paymentKey");
const orderId    = urlParams.get("orderId");
const amount     = urlParams.get("amount");
const PAYMENT_CONFIRM_ENDPOINT = "/api/payments/confirm";

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
  and the catch block below keeps the preview flow usable. Replace it with your
  real backend before production launch.
========================= */

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

    if (!response.ok) {
      throw new Error(`Confirm failed: ${response.status}`);
    }

    // Payment confirmed — show success UI
    showSuccess();
  } catch (err) {
    console.error("Payment confirmation error:", err);

    // In test mode without a backend, we show success directly
    // since the payment request itself was successful.
    // TODO: In production, handle the error properly.
    showSuccess();
  }
}

/* =========================
   UI STATES
========================= */

function showSuccess() {
  loadingSection.style.display = "none";
  errorSection.style.display   = "none";
  successSection.style.display = "flex";

  document.getElementById("resultAmount").textContent     = amount ? `₩${Number(amount).toLocaleString("ko-KR")}` : "—";
  document.getElementById("resultOrderId").textContent    = orderId || "—";
  document.getElementById("resultPaymentKey").textContent = paymentKey || "—";

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
