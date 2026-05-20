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
const orderStatusEl = document.getElementById("resultOrderStatus");
const orderStatusDetailEl = document.getElementById("resultOrderStatusDetail");

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

function resolveOrderStatusSummary(payment, order) {
  const shipmentValue = String(order?.shipment?.status || "").trim().toLowerCase();
  const carrier = String(order?.shipment?.carrier || "").trim();
  const trackingNumber = String(order?.shipment?.trackingNumber || "").trim();
  const trackingText = [carrier, trackingNumber].filter(Boolean).join(" / ");

  if (shipmentValue === "confirmed") {
    return {
      label: "주문 확인 완료",
      detail: "배송 준비 상태와 운송장 정보는 이후 업데이트됩니다.",
    };
  }

  if (["ready", "packing"].includes(shipmentValue)) {
    return {
      label: "배송 준비 중",
      detail: "출고가 준비되는 대로 배송 상태가 업데이트됩니다.",
    };
  }

  if (shipmentValue === "shipped") {
    return {
      label: "배송 중",
      detail: trackingText ? `운송장 ${trackingText}` : "운송장 정보가 등록되었습니다.",
    };
  }

  if (shipmentValue === "delivered") {
    return {
      label: "배송 완료",
      detail: trackingText ? `운송장 ${trackingText}` : "상품 전달이 완료되었습니다.",
    };
  }

  if (shipmentValue === "returned") {
    return {
      label: "반송 완료",
      detail: "반송 처리 상태입니다. 자세한 내용은 관리자에게 문의해주세요.",
    };
  }

  const paymentValue = String(payment?.status || order?.paymentStatus || order?.status || "").trim().toLowerCase();
  if (["done", "confirmed", "paid", "completed", "success", "succeeded"].includes(paymentValue)) {
    return {
      label: "주문 확인 완료",
      detail: "배송 상태는 계정 또는 비회원 주문 조회에서 계속 확인할 수 있습니다.",
    };
  }

  return {
    label: "결제 확인 중",
    detail: "결제 결과를 확인한 뒤 주문 상태가 갱신됩니다.",
  };
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
    showSuccess(payload.payment, payload.order || null);
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

function showSuccess(payment = null, order = null) {
  loadingSection.style.display = "none";
  errorSection.style.display   = "none";
  successSection.style.display = "flex";

  const confirmedAmount = payment?.amount ?? amount;
  const confirmedOrderId = payment?.orderId ?? orderId;
  const confirmedPaymentKey = payment?.paymentKey ?? paymentKey;

  document.getElementById("resultAmount").textContent     = confirmedAmount ? `₩${Number(confirmedAmount).toLocaleString("ko-KR")}` : "—";
  document.getElementById("resultOrderId").textContent    = confirmedOrderId || "—";
  document.getElementById("resultPaymentKey").textContent = confirmedPaymentKey || "—";

  const statusSummary = resolveOrderStatusSummary(payment, order);
  if (orderStatusEl) {
    orderStatusEl.textContent = statusSummary.label;
  }
  if (orderStatusDetailEl) {
    orderStatusDetailEl.textContent = statusSummary.detail;
  }

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
