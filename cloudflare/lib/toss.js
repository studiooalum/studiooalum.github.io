const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";

function getTossCancelUrl(paymentKey) {
  return `https://api.tosspayments.com/v1/payments/${encodeURIComponent(String(paymentKey || "").trim())}/cancel`;
}

export function getTossConfig(env) {
  const clientKey = String(env?.TOSS_CLIENT_KEY || env?.NEXT_PUBLIC_TOSS_CLIENT_KEY || "").trim();
  const secretKey = String(env?.TOSS_SECRET_KEY || "").trim();
  // Never return a secret accidentally entered in the client-key setting.
  const clientMode = /^(test|live)_(?:gck|ck)_/.exec(clientKey)?.[1] || "";
  const serverMode = /^(test|live)_(?:gsk|sk)_/.exec(secretKey)?.[1] || "";
  const consistent = Boolean(serverMode && (!clientKey || clientMode === serverMode));
  const configurationError = !clientKey || !secretKey ? "토스 클라이언트 키와 시크릿 키를 모두 설정해주세요."
    : !clientMode ? "TOSS_CLIENT_KEY에 토스 클라이언트 키(live_gck_ 또는 live_ck_)를 입력해주세요."
    : !serverMode ? "TOSS_SECRET_KEY에 토스 시크릿 키(live_gsk_ 또는 live_sk_)를 입력해주세요."
    : !consistent ? "토스 클라이언트 키와 시크릿 키의 테스트/라이브 모드가 다릅니다." : "";

  return {
    clientKey,
    secretKey,
    configurationError,
    mode: serverMode || clientMode,
    isClientReady: Boolean(clientMode && consistent),
    isServerReady: consistent,
    internationalCardsEnabled: isTruthyFlag(env?.TOSS_INTERNATIONAL_CARDS_ENABLED),
  };
}

function isTruthyFlag(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function shouldRequirePersistence() {
  return true;
}

export async function confirmTossPayment(env, { paymentKey, orderId, amount }) {
  const config = getTossConfig(env);
  assertPaymentInput(config, paymentKey, orderId, amount);
  let payload;
  try {
    payload = await tossRequest(config, TOSS_CONFIRM_URL, { paymentKey, orderId, amount }, `confirm-${orderId}`);
  } catch (error) {
    if (!error.retryable && error.providerCode !== "ALREADY_PROCESSED_PAYMENT") throw error;
    payload = await tossRequest(config, `https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}`);
  }
  assertPaymentResult(payload, { paymentKey, orderId, amount, status: "DONE" });

  return {
    provider: "toss",
    providerMode: `${config.mode}-confirmation`,
    orderId: payload.orderId,
    orderName: payload.orderName || orderId,
    amount: payload.totalAmount,
    paymentKey: payload.paymentKey,
    method: payload.method || null,
    status: payload.status,
    approvedAt: payload.approvedAt,
    rawResponse: payload,
  };
}

export async function cancelTossPayment(env, {
  paymentKey,
  orderId,
  amount,
  cancelReason,
  cancelAmount = amount,
  idempotencyKey = `cancel-${orderId}-${cancelAmount}`,
}) {
  const config = getTossConfig(env);
  assertPaymentInput(config, paymentKey, orderId, amount);
  if (!Number.isSafeInteger(cancelAmount) || cancelAmount <= 0 || cancelAmount > amount) throw Object.assign(new Error('환불 금액을 확인해주세요.'), {status:400});
  let payload;
  try {
    payload = await tossRequest(config, getTossCancelUrl(paymentKey), {
      cancelReason: String(cancelReason || "고객 요청으로 주문이 취소되었습니다.").trim(),
      cancelAmount,
    }, idempotencyKey);
  } catch (error) {
    if (!error.retryable && error.providerCode !== "ALREADY_CANCELED_PAYMENT") throw error;
    payload = await tossRequest(config, `https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}`);
  }
  assertPaymentResult(payload, { paymentKey, orderId, amount, status: cancelAmount === amount ? 'CANCELED' : 'PARTIAL_CANCELED' });
  if (payload.balanceAmount !== amount - cancelAmount) throw Object.assign(new Error('환불 잔액이 일치하지 않습니다. 결제 내역 확인이 필요합니다.'), {status:502});

  const cancels = Array.isArray(payload?.cancels) ? payload.cancels : [];
  const latestCancel = cancels[cancels.length - 1] || null;

  return {
    provider: "toss",
    providerMode: `${config.mode}-cancellation`,
    orderId: payload.orderId,
    orderName: payload?.orderName || orderId,
    amount: payload.totalAmount,
    paymentKey: payload.paymentKey,
    method: payload?.method || null,
    status: payload.status,
    approvedAt: payload?.approvedAt || null,
    cancelledAt: latestCancel?.canceledAt || latestCancel?.cancelledAt || payload?.canceledAt || payload?.cancelledAt || new Date().toISOString(),
    rawResponse: payload,
  };
}

function assertPaymentInput(config, paymentKey, orderId, amount) {
  if (!config.isServerReady) throw Object.assign(new Error("결제 설정이 준비되지 않았습니다."), { status: 503 });
  if (!paymentKey || !orderId || !Number.isSafeInteger(amount) || amount <= 0) {
    throw Object.assign(new Error("결제 주문과 금액을 다시 확인해주세요."), { status: 400 });
  }
}

function assertPaymentResult(payload, { paymentKey, orderId, amount, status }) {
  if (!payload || payload.paymentKey !== paymentKey || payload.orderId !== orderId
    || payload.totalAmount !== amount || payload.currency !== "KRW" || payload.status !== status
    || (status === "DONE" && !payload.approvedAt) || (status === "CANCELED" && payload.balanceAmount !== 0)) {
    throw Object.assign(new Error("결제사의 처리 결과가 주문과 일치하지 않습니다. 결제 내역 확인이 필요합니다."), { status: 502 });
  }
}

async function tossRequest(config, url, body, idempotencyKey, timeoutMs = 15000) {
  let response;
  try {
    response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Basic ${btoa(`${config.secretKey}:`)}`, "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw Object.assign(new Error("결제사 응답을 확인 중입니다. 잠시 후 다시 확인해주세요."), { status: 503, retryable: true });
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error("결제사에서 요청을 처리하지 못했습니다. 잠시 후 결제 상태를 다시 확인해주세요."), {
      status: response.status >= 500 ? 503 : 409,
      providerCode: payload?.code || "", retryable: response.status >= 500 || response.status === 429,
    });
  }
  return payload;
}

export async function readTossPayment(env, paymentKey, { timeoutMs = 15000 } = {}) {
  const config = getTossConfig(env);
  if (!config.isServerReady || !paymentKey) throw Object.assign(new Error("결제 조회 설정을 확인해주세요."), { status: 503 });
  return tossRequest(config, `https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}`, undefined, undefined, timeoutMs);
}
