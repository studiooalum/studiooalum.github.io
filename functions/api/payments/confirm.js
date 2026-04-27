import { buildPreviewPayment, paymentConfirmSchema } from "../../../cloudflare/lib/commerce.js";
import { hasD1, persistPayment } from "../../../cloudflare/lib/d1.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";
import { canConfirmWithToss, confirmTossPayment } from "../../../cloudflare/lib/toss.js";

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const payload = await readJson(context.request);
    const parsed = paymentConfirmSchema.safeParse(payload);

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const data = parsed.data;
    const payment = canConfirmWithToss(context.env, data.paymentKey)
      ? await confirmTossPayment(context.env, data)
      : buildPreviewPayment(data);

    const warnings = [];
    let persisted = false;

    if (hasD1(context.env)) {
      try {
        persisted = await persistPayment(context.env, payment);
      } catch (error) {
        warnings.push(error.message);
      }
    }

    return json(context.env, {
      ok: true,
      payment: {
        ...payment,
        persisted,
      },
      warnings,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to confirm payment.");
  }
}