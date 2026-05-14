const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";

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