import { z } from "zod";

import {
  buildDeliveryTrackerLink,
  fetchDeliveryTrackerTrack,
  getDeliveryTrackerConfig,
  mapDeliveryTrackerTrackToShipment,
} from "../../../cloudflare/lib/delivery-tracker.js";
import { readOrderSyncSnapshot, updateShipmentByTrackingReference } from "../../../cloudflare/lib/d1.js";
import { errorResponse, json, noContent, readJson } from "../../../cloudflare/lib/http.js";

const deliveryTrackerWebhookSchema = z.object({
  carrierId: z.string().trim().min(1),
  trackingNumber: z.string().trim().min(1),
});

function isAuthorizedWebhook(context) {
  const config = getDeliveryTrackerConfig(context.env);
  if (!config.webhookSecret) {
    return true;
  }

  const url = new URL(context.request.url);
  return url.searchParams.get("token") === config.webhookSecret;
}

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    if (!isAuthorizedWebhook(context)) {
      throw Object.assign(new Error("Unauthorized Delivery Tracker webhook."), {
        status: 401,
      });
    }

    const payload = await readJson(context.request);
    const parsed = deliveryTrackerWebhookSchema.safeParse(payload);

    if (!parsed.success) {
      throw Object.assign(new Error("Invalid Delivery Tracker webhook payload."), {
        status: 400,
        details: parsed.error.flatten(),
      });
    }

    const track = await fetchDeliveryTrackerTrack(context.env, parsed.data);
    const shipmentPatch = mapDeliveryTrackerTrackToShipment(track);
    const result = await updateShipmentByTrackingReference(context.env, {
      ...parsed.data,
      ...shipmentPatch,
      trackingUrl: buildDeliveryTrackerLink(context.env, parsed.data),
    });

    if (!result) {
      return json(context.env, {
        ok: true,
        ignored: true,
      }, { status: 202 });
    }

    const order = await readOrderSyncSnapshot(context.env, result.orderId);

    return json(context.env, {
      ok: true,
      order,
    }, { status: 202 });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to process Delivery Tracker webhook.");
  }
}