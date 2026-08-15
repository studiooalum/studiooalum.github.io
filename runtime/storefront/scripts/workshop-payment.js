const dom = {
  layout: document.getElementById("workshopPaymentLayout"),
  orderName: document.getElementById("workshopPaymentOrderName"),
  orderTotal: document.getElementById("workshopPaymentOrderTotal"),
  status: document.getElementById("workshopPaymentStatus"),
  methodsSection: document.getElementById("workshopPaymentMethodsSection"),
  agreementSection: document.getElementById("workshopPaymentAgreementSection"),
  buttonSection: document.getElementById("workshopPaymentButtonSection"),
  requestButton: document.getElementById("workshop-payment-request-button"),
};

const query = new URLSearchParams(window.location.search);
const checkoutId = String(query.get("checkoutId") || "").trim();

function formatCurrency(amount) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(Math.max(0, Number(amount) || 0));
}

async function requestJson(url, { method = "POST", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "요청을 처리하지 못했습니다.");
  }
  return payload;
}

function setStatus(message = "", isError = false) {
  if (!dom.status) return;
  dom.status.textContent = message;
  dom.status.style.color = isError ? "#b42318" : "";
}

function setPaymentUiVisible(visible) {
  if (dom.methodsSection) dom.methodsSection.hidden = !visible;
  if (dom.agreementSection) dom.agreementSection.hidden = !visible;
  if (dom.buttonSection) dom.buttonSection.hidden = !visible;
}

function setOrderSummary(checkout) {
  if (dom.orderName) {
    dom.orderName.textContent = checkout?.workshop?.title || "워크숍";
  }
  if (dom.orderTotal) {
    dom.orderTotal.textContent = formatCurrency(checkout?.order?.amount);
  }
}

function renderResult(title, message, isError = false) {
  setPaymentUiVisible(false);
  if (dom.layout) {
    dom.layout.innerHTML = "";
    const result = document.createElement("section");
    result.className = "payment-result";

    const heading = document.createElement("h1");
    heading.className = "payment-result__title";
    heading.textContent = title;

    const description = document.createElement("p");
    description.className = "payment-result__desc";
    description.textContent = message;
    if (isError) description.style.color = "#b42318";

    const actions = document.createElement("div");
    actions.className = "payment-result__actions";
    const link = document.createElement("a");
    link.className = "payment-btn--outline";
    link.href = "./workshops";
    link.textContent = "워크숍 목록으로";
    actions.appendChild(link);
    result.append(heading, description, actions);
    dom.layout.appendChild(result);
  }
}

function buildResultUrl(parameters = {}) {
  const url = new URL("./workshop-payment", window.location.href);
  url.searchParams.set("checkoutId", checkoutId);
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function confirmReturnedPayment() {
  const paymentKey = String(query.get("paymentKey") || "").trim();
  const orderId = String(query.get("orderId") || "").trim();
  const amount = Number(query.get("amount") || 0);

  if (!paymentKey || !orderId || !Number.isInteger(amount) || amount < 1) {
    renderResult("결제 정보를 확인할 수 없습니다.", "워크숍 페이지에서 다시 신청해주세요.", true);
    return;
  }

  try {
    setStatus("결제를 확인하고 있습니다.");
    const payload = await requestJson("./api/workshops/payment-confirm", {
      body: { checkoutId, paymentKey, orderId, amount },
    });
    renderResult("워크숍 신청이 확정되었습니다.", `${payload?.reservation?.workshopTitle || "워크숍"} 결제가 완료되었습니다.`);
  } catch (error) {
    renderResult("결제를 확정하지 못했습니다.", error.message || "관리자에게 문의해주세요.", true);
  }
}

async function releaseFailedPayment() {
  try {
    await requestJson("./api/workshops/payment-failed", {
      body: {
        checkoutId,
        orderId: String(query.get("orderId") || "").trim(),
      },
    });
  } catch (error) {
    console.warn("Failed to release the workshop payment reservation.", error);
  }
}

async function renderCheckout() {
  if (!checkoutId) {
    renderResult("결제 정보를 찾을 수 없습니다.", "워크숍 신청 후 받은 결제 링크로 다시 접속해주세요.", true);
    return;
  }

  if (query.get("paymentKey")) {
    await confirmReturnedPayment();
    return;
  }

  if (query.get("code") || query.get("message")) {
    await releaseFailedPayment();
    renderResult("결제가 완료되지 않았습니다.", String(query.get("message") || "결제를 다시 시도해주세요."), true);
    return;
  }

  try {
    setStatus("결제 정보를 불러오는 중입니다.");
    const payload = await requestJson("./api/workshops/checkout", { body: { checkoutId } });
    const checkout = payload.checkout;
    setOrderSummary(checkout);

    if (typeof TossPayments === "undefined") {
      throw new Error("결제 모듈을 불러오지 못했습니다. 페이지를 새로고침해주세요.");
    }

    const tossPayments = TossPayments(checkout.clientKey);
    const widgets = tossPayments.widgets({ customerKey: TossPayments.ANONYMOUS });
    await widgets.setAmount({ currency: "KRW", value: checkout.order.amount });
    await Promise.all([
      widgets.renderPaymentMethods({ selector: "#workshop-payment-method", variantKey: "DEFAULT" }),
      widgets.renderAgreement({ selector: "#workshop-agreement", variantKey: "AGREEMENT" }),
    ]);

    setStatus("결제 수단을 선택해주세요.");
    dom.requestButton.disabled = false;
    dom.requestButton.addEventListener("click", async () => {
      dom.requestButton.disabled = true;
      dom.requestButton.textContent = "결제 요청 중";
      try {
        await widgets.requestPayment({
          orderId: checkout.order.orderId,
          orderName: `${checkout.workshop.title} 워크숍`,
          successUrl: buildResultUrl(),
          failUrl: buildResultUrl(),
          customerEmail: checkout.customer.email,
          customerName: checkout.customer.name,
          customerMobilePhone: String(checkout.customer.phone || "").replace(/[^0-9]/g, ""),
        });
      } catch (error) {
        dom.requestButton.disabled = false;
        dom.requestButton.textContent = "결제하기";
        setStatus(error?.message || "결제 요청을 취소했습니다.", true);
      }
    });
  } catch (error) {
    renderResult("결제를 준비하지 못했습니다.", error.message || "관리자에게 문의해주세요.", true);
  }
}

renderCheckout();