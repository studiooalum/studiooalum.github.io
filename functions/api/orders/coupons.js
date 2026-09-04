import { z } from "zod";

import { requireAdminAccess } from "../../../cloudflare/lib/admin.js";
import { deleteCoupon, readCoupons, upsertCoupon } from "../../../cloudflare/lib/coupons.js";
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

const couponDeleteSchema = z.object({
  id: z.string().trim().min(1).max(80),
});

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    await requireAdminAccess(context);

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
    await requireAdminAccess(context);

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

export async function onRequestDelete(context) {
  try {
    await requireAdminAccess(context);
    const parsed = couponDeleteSchema.safeParse(await readJson(context.request));
    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const deleted = await deleteCoupon(context.env, parsed.data.id);
    return json(context.env, { ok: true, message: "쿠폰을 삭제했습니다.", deleted });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to delete coupon.");
  }
}