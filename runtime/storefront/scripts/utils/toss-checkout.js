// Both SDK products use the same server confirmation and refund endpoints.
export async function createTossCheckout({ clientKey, amount, methodsSelector, agreementSelector, paymentVariantKey = "DEFAULT", agreementVariantKey = "AGREEMENT" }, { sdk = globalThis.TossPayments, document = globalThis.document } = {}) {
  if (typeof sdk !== "function") throw new Error("결제 모듈을 불러오지 못했습니다. 새로고침해주세요.");
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("결제 금액을 다시 확인해주세요.");
  const toss = sdk(clientKey);
  const customer = { customerKey: sdk.ANONYMOUS };
  if (/^(test|live)_ck_/.test(clientKey)) {
    const payment = toss.payment(customer);
    document.querySelector(methodsSelector).textContent = "결제하기를 누르면 카드·간편결제를 선택할 수 있습니다.";
    document.querySelector(agreementSelector).textContent = "결제 서비스 약관은 토스 결제창에서 확인하고 동의할 수 있습니다.";
    return { requestPayment: (options) => payment.requestPayment({ ...options, method: "CARD", amount: { currency: "KRW", value: amount } }) };
  }
  const widgets = toss.widgets(customer);
  await widgets.setAmount({ currency: "KRW", value: amount });
  const [methods] = await Promise.all([
    widgets.renderPaymentMethods({ selector: methodsSelector, variantKey: paymentVariantKey }),
    widgets.renderAgreement({ selector: agreementSelector, variantKey: agreementVariantKey }),
  ]);
  return {
    async requestPayment(options) {
      const selected = await methods.getSelectedPaymentMethod();
      // Reservation capacity and refunds currently use immediate-payment flows.
      // Do not issue a virtual account and then misreport it as a failed charge.
      if ([selected?.code, selected?.method].some(value => ["VIRTUAL_ACCOUNT", "가상계좌"].includes(value))) {
        throw new Error("가상계좌는 현재 지원하지 않습니다. 카드·간편결제 또는 계좌이체를 선택해주세요.");
      }
      return widgets.requestPayment(options);
    },
  };
}
