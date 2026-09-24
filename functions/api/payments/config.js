import { getTossConfig } from "../../../cloudflare/lib/toss.js";
import { json } from "../../../cloudflare/lib/http.js";

export function onRequestGet(context) {
  const config = getTossConfig(context.env);
  return json(context.env, {
    ok: config.isClientReady,
    clientKey: config.isClientReady ? config.clientKey : "",
    currency: "KRW",
    mode: config.mode,
    paymentVariantKey: context.env.TOSS_PAYMENT_VARIANT_KEY || "DEFAULT",
    agreementVariantKey: context.env.TOSS_AGREEMENT_VARIANT_KEY || "AGREEMENT",
    error: config.isClientReady ? undefined : "결제 설정이 준비되지 않았습니다.",
  }, { status: config.isClientReady ? 200 : 503 });
}