import { z } from "zod";

import { readCoupons, upsertCoupon } from "../../../cloudflare/lib/coupons.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const couponSchema = z.object({
  id: z.string().trim().max(80).optional(),
  code: z.string().trim().max(48).optional(),
  title: z.string().trim().min(1).max(120),
  scope: z.enum(["public", "targeted"]).optional().default("targeted"),
  targetEmail: z.string().trim().email().optional().or(z.literal("")).default(""),
  userId: z.string().trim().max(80).optional(),
  discountType: z.enum(["fixed", "percent"]),
  discountValue: z.coerce.number().int().positive(),
  minimumOrderAmount: z.coerce.number().int().nonnegative().optional().default(0),
  maximumDiscountAmount: z.coerce.number().int().nonnegative().optional().default(0),
  usageLimit: z.coerce.number().int().positive().optional().default(1),
  startsAt: z.string().trim().optional().or(z.literal("")),
  expiresAt: z.string().trim().optional().or(z.literal("")),
  isActive: z.boolean().optional().default(true),
});

function getAdminKey(request) {
  const authHeader = String(request.headers.get("authorization") || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return String(request.headers.get("x-order-admin-key") || "").trim();
}

function requireAdminKey(context) {
  const expected = String(context.env.ORDER_ADMIN_SECRET || "").trim();
  if (!expected) {
    throw Object.assign(new Error("ORDER_ADMIN_SECRET must be configured before coupon management can be used."), {
      status: 503,
    });
  }

  const provided = getAdminKey(context.request);
  if (!provided || provided !== expected) {
    throw Object.assign(new Error("Unauthorized coupon management request."), {
      status: 401,
    });
  }
}

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    requireAdminKey(context);

    const url = new URL(context.request.url);
    const query = String(url.searchParams.get("query") || "").trim();
    const limit = Number(url.searchParams.get("limit") || 20);
    const coupons = await readCoupons(context.env, { query, limit });

    return json(context.env, {
      ok: true,
      coupons,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to load coupons.");
  }
}

export async function onRequestPost(context) {
  try {
    requireAdminKey(context);

    const payload = await readJson(context.request);
    const parsed = couponSchema.safeParse(payload);

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const coupon = await upsertCoupon(context.env, parsed.data);

    return json(context.env, {
      ok: true,
      coupon,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to save coupon.");
  }
}