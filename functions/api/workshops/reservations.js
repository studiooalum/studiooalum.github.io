import { z } from "zod";

import { readSession } from "../../../cloudflare/lib/auth.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";
import { createWorkshopReservation } from "../../../cloudflare/lib/workshops.js";

const reservationSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  slotKey: z.string().trim().max(160).optional().default(""),
  requestedDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().default(""),
  joinPolicy: z.enum(["open", "private"]).optional().default("private"),
  allowAdditionalAttendees: z.boolean().optional().default(false),
  groupMode: z.enum(["open", "private"]).optional(),
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(1).max(40),
  note: z.string().trim().max(500).optional().default(""),
  attendeeCount: z.number().int().min(1).max(100).optional().default(1),
});

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const payload = await readJson(context.request);
    const parsed = reservationSchema.safeParse(payload);

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const session = await readSession(context.env, context.request, { touch: false });
    const result = await createWorkshopReservation(context.env, parsed.data, {
      userId: session?.user?.id || null,
      accountEmail: session?.user?.email || "",
      accountFullName: session?.user?.fullName || "",
      accountPhone: session?.user?.phone || "",
    });

    return json(context.env, {
      ok: true,
      reservation: result.reservation,
      workshop: result.workshop,
      requiresPayment: Boolean(result.requiresPayment || result.reservation?.checkoutId),
      checkoutId: result.checkoutId || result.reservation?.checkoutId || null,
      payment: result.requiresPayment || result.reservation?.checkoutId ? {
        amount: result.reservation?.finalAmount ?? result.reservation?.amountDue ?? 0,
        orderName: result.reservation?.workshopTitle || "워크샵",
        redirectUrl: `./workshop-payment?checkoutId=${encodeURIComponent(result.checkoutId || result.reservation?.checkoutId || "")}`,
      } : null,
      linkedToAccount: Boolean(session?.user?.id),
    }, { status: 201 });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to create workshop reservation.");
  }
}