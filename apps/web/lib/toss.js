const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";

function roundAmount(value) {
  return Math.round(Number(value) || 0);
}

export function getTossConfig() {
  const clientKey = String(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || "").trim();
  const secretKey = String(process.env.TOSS_SECRET_KEY || "").trim();

  return {
    clientKey,
    secretKey,
    isClientReady: Boolean(clientKey),
    isServerReady: Boolean(secretKey),
  };
}

export function canConfirmWithToss(paymentKey) {
  return Boolean(getTossConfig().isServerReady && String(paymentKey || "").trim());
}

export async function confirmTossPayment({ paymentKey, orderId, amount }) {
  const { secretKey } = getTossConfig();

  if (!secretKey) {
    throw Object.assign(new Error("TOSS_SECRET_KEY is not configured."), {
      status: 500,
    });
  }

  const response = await fetch(TOSS_CONFIRM_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      paymentKey,
      orderId,
      amount: roundAmount(amount),
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw Object.assign(new Error(payload?.message || payload?.code || "Toss confirmation failed."), {
      status: response.status,
      payload,
    });
  }

  return {
    provider: "toss",
    orderId: payload?.orderId || orderId,
    orderName: payload?.orderName || orderId,
    amount: roundAmount(payload?.totalAmount ?? amount),
    paymentKey: payload?.paymentKey || paymentKey,
    method: payload?.method || null,
    status: payload?.status || "DONE",
    providerMode: "live-confirmation",
    approvedAt: payload?.approvedAt || new Date().toISOString(),
    rawResponse: payload,
  };
}