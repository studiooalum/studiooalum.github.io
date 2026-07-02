const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";

function getTossCancelUrl(paymentKey) {
  return `https://api.tosspayments.com/v1/payments/${encodeURIComponent(String(paymentKey || "").trim())}/cancel`;
}

function roundAmount(value) {
  return Math.round(Number(value) || 0);
}

export function getTossConfig(env) {
  const clientKey = String(env?.NEXT_PUBLIC_TOSS_CLIENT_KEY || env?.TOSS_CLIENT_KEY || "").trim();
  const secretKey = String(env?.TOSS_SECRET_KEY || "").trim();

  return {
    clientKey,
    secretKey,
    isClientReady: Boolean(clientKey),
    isServerReady: Boolean(secretKey),
  };
}

function isTruthyFlag(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function shouldRequirePersistence(env) {
  return Boolean(getTossConfig(env).isServerReady || isTruthyFlag(env?.OALUM_STRICT_PERSISTENCE));
}

export function canConfirmWithToss(env, paymentKey) {
  return Boolean(getTossConfig(env).isServerReady && String(paymentKey || "").trim());
}

export async function confirmTossPayment(env, { paymentKey, orderId, amount }) {
  const { secretKey } = getTossConfig(env);

  if (!secretKey) {
    throw Object.assign(new Error("TOSS_SECRET_KEY is not configured."), {
      status: 500,
    });
  }

  const response = await fetch(TOSS_CONFIRM_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${secretKey}:`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      paymentKey,
      orderId,
      amount: roundAmount(amount),
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw Object.assign(new Error(payload?.message || payload?.code || "Toss confirmation failed."), {
      status: response.status || 502,
      details: payload,
    });
  }

  return {
    provider: "toss",
    providerMode: "live-confirmation",
    orderId: payload?.orderId || orderId,
    orderName: payload?.orderName || orderId,
    amount: roundAmount(payload?.totalAmount ?? amount),
    paymentKey: payload?.paymentKey || paymentKey,
    method: payload?.method || null,
    status: payload?.status || "DONE",
    approvedAt: payload?.approvedAt || new Date().toISOString(),
    rawResponse: payload,
  };
}

export async function cancelTossPayment(env, {
  paymentKey,
  orderId,
  amount,
  cancelReason,
}) {
  const { secretKey } = getTossConfig(env);

  if (!secretKey) {
    throw Object.assign(new Error("TOSS_SECRET_KEY is not configured."), {
      status: 500,
    });
  }

  const normalizedPaymentKey = String(paymentKey || "").trim();
  if (!normalizedPaymentKey) {
    throw Object.assign(new Error("결제 취소에 필요한 paymentKey를 찾지 못했습니다."), {
      status: 400,
    });
  }

  const response = await fetch(getTossCancelUrl(normalizedPaymentKey), {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${secretKey}:`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cancelReason: String(cancelReason || "고객 요청으로 주문이 취소되었습니다.").trim(),
      cancelAmount: roundAmount(amount),
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw Object.assign(new Error(payload?.message || payload?.code || "Toss cancellation failed."), {
      status: response.status || 502,
      details: payload,
    });
  }

  const cancels = Array.isArray(payload?.cancels) ? payload.cancels : [];
  const latestCancel = cancels[cancels.length - 1] || null;

  return {
    provider: "toss",
    providerMode: "live-cancellation",
    orderId: payload?.orderId || orderId,
    orderName: payload?.orderName || orderId,
    amount: roundAmount(payload?.totalAmount ?? amount),
    paymentKey: payload?.paymentKey || normalizedPaymentKey,
    method: payload?.method || null,
    status: payload?.status || "CANCELED",
    approvedAt: payload?.approvedAt || null,
    cancelledAt: latestCancel?.canceledAt || latestCancel?.cancelledAt || payload?.canceledAt || payload?.cancelledAt || new Date().toISOString(),
    rawResponse: payload,
  };
}