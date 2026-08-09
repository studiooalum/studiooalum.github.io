import { z } from "zod";

import { readSession } from "../../../cloudflare/lib/auth.js";
import { computeOrderAmount, normalizeOrderItems } from "../../../cloudflare/lib/commerce.js";
import { prepareOrderPricing } from "../../../cloudflare/lib/d1.js";
import { prepareCouponPricing } from "../../../cloudflare/lib/coupons.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const orderQuoteSchema = z.object({
  items: z.array(z.any()).min(1),
  shippingEmail: z.string().trim().email().optional().or(z.literal("")).default(""),
  pointsUsed: z.coerce.number().int().nonnegative().optional().default(0),
  couponCode: z.string().trim().max(48).optional().default(""),
});

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const payload = await readJson(context.request);
    const parsed = orderQuoteSchema.safeParse(payload);

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const session = await readSession(context.env, context.request, { touch: false });
    const items = normalizeOrderItems(parsed.data.items);
    const subtotal = computeOrderAmount(items);
    const coupon = parsed.data.couponCode
      ? await prepareCouponPricing(context.env, {
          userId: session?.user?.id || null,
          email: parsed.data.shippingEmail || "",
          subtotalAmount: subtotal,
          couponCode: parsed.data.couponCode,
        })
      : null;
    const pricing = await prepareOrderPricing(context.env, {
      userId: session?.user?.id || null,
      email: parsed.data.shippingEmail || "",
      subtotalAmount: subtotal,
      requestedPoints: parsed.data.pointsUsed,
      coupon,
    });

    return json(context.env, {
      ok: true,
      quote: {
        subtotalAmount: pricing.subtotalAmount,
        discountAmount: pricing.discountAmount,
        couponDiscountAmount: pricing.couponDiscountAmount || 0,
        couponCode: parsed.data.couponCode || "",
        couponTitle: pricing.coupon?.title || "",
        couponScope: pricing.coupon?.scope || "",
        couponReservationExpiresAt: pricing.couponReservationExpiresAt || null,
        pointsUsed: pricing.pointsUsed,
        totalAmount: pricing.totalAmount,
        availablePoints: pricing.availablePoints,
      },
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to calculate pricing quote.");
  }
}