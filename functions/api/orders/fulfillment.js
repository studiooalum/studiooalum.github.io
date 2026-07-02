import { z } from "zod";

import {
  buildDeliveryTrackerLink,
  buildDeliveryTrackerWebhookUrl,
  getDeliveryTrackerConfig,
  registerDeliveryTrackerWebhook,
  searchDeliveryTrackerCarriers,
} from "../../../cloudflare/lib/delivery-tracker.js";
import { readFulfillmentOrders, readOrderSyncSnapshot, updateShipment } from "../../../cloudflare/lib/d1.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const shipmentUpdateSchema = z.object({
  orderId: z.string().trim().min(1).max(80),
  status: z.enum(["confirmed", "ready", "packing", "shipped", "delivered", "returned", "cancelled"]),
  carrierId: z.string().trim().max(120).optional().default(""),
  carrier: z.string().trim().max(120).optional().default(""),
  trackingNumber: z.string().trim().max(120).optional().default(""),
  trackingUrl: z.union([z.string().trim().url(), z.literal("")]).optional().default(""),
  shippedAt: z.string().trim().optional(),
  deliveredAt: z.string().trim().optional(),
}).superRefine((value, context) => {
  if (value.status === "shipped" && !String(value.trackingNumber || "").trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["trackingNumber"],
      message: "trackingNumber is required when status is shipped.",
    });
  }
});

function mapShipmentResponse(shipment) {
  if (!shipment) {
    return null;
  }

  return {
    status: shipment.status,
    carrierId: shipment.carrier_id || "",
    carrier: shipment.carrier || "",
    trackingNumber: shipment.tracking_number || "",
    trackingUrl: shipment.tracking_url || "",
    trackerRegisteredAt: shipment.tracker_registered_at || null,
    trackerLastSyncedAt: shipment.tracker_last_synced_at || null,
    trackerLastEventAt: shipment.tracker_last_event_at || null,
    trackerLastEventCode: shipment.tracker_last_event_code || "",
    trackerLastEventName: shipment.tracker_last_event_name || "",
    trackerLastEventDescription: shipment.tracker_last_event_description || "",
    shippedAt: shipment.shipped_at || null,
    deliveredAt: shipment.delivered_at || null,
    updatedAt: shipment.updated_at || null,
  };
}

function getFulfillmentConfig(env) {
  const tracker = getDeliveryTrackerConfig(env);

  return {
    deliveryTracker: {
      enabled: tracker.isConfigured,
      trackingLinkSupported: tracker.canBuildTrackingLink,
      webhookProtected: tracker.hasWebhookSecret,
    },
  };
}

function buildWebhookExpirationTime() {
  return new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
}

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
    throw Object.assign(new Error("ORDER_ADMIN_SECRET must be configured before fulfillment updates can be used."), {
      status: 503,
    });
  }

  const provided = getAdminKey(context.request);
  if (!provided || provided !== expected) {
    throw Object.assign(new Error("Unauthorized fulfillment update request."), {
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
    const orderId = String(url.searchParams.get("orderId") || "").trim();
    const carrierSearch = String(url.searchParams.get("carrierSearch") || "").trim();
    const query = String(url.searchParams.get("query") || "").trim();
    const limit = Number(url.searchParams.get("limit") || 20);
    const config = getFulfillmentConfig(context.env);

    if (carrierSearch) {
      const carriers = config.deliveryTracker.enabled
        ? await searchDeliveryTrackerCarriers(context.env, carrierSearch)
        : [];

      return json(context.env, {
        ok: true,
        carriers,
        config,
      });
    }

    if (orderId) {
      const order = await readOrderSyncSnapshot(context.env, orderId);

      if (!order) {
        throw Object.assign(new Error("주문 정보를 찾을 수 없습니다."), {
          status: 404,
        });
      }

      return json(context.env, {
        ok: true,
        order,
        config,
      });
    }

    const orders = await readFulfillmentOrders(context.env, { query, limit });

    return json(context.env, {
      ok: true,
      orders,
      config,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to load fulfillment data.");
  }
}

export async function onRequestPost(context) {
  try {
    requireAdminKey(context);

    const payload = await readJson(context.request);
    const parsed = shipmentUpdateSchema.safeParse(payload);

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const data = parsed.data;
    const config = getFulfillmentConfig(context.env);
    const trackerState = {
      attempted: false,
      registered: false,
      warning: "",
    };
    let trackingUrl = data.trackingUrl;
    let trackerRegisteredAt = undefined;

    if (!trackingUrl && data.carrierId && data.trackingNumber) {
      trackingUrl = buildDeliveryTrackerLink(context.env, {
        carrierId: data.carrierId,
        trackingNumber: data.trackingNumber,
      }) || "";
    }

    if (data.carrierId && data.trackingNumber) {
      trackerState.attempted = true;

      if (config.deliveryTracker.enabled) {
        try {
          const registered = await registerDeliveryTrackerWebhook(context.env, {
            carrierId: data.carrierId,
            trackingNumber: data.trackingNumber,
            callbackUrl: buildDeliveryTrackerWebhookUrl(context.request, context.env),
            expirationTime: buildWebhookExpirationTime(),
          });

          trackerState.registered = registered;
          trackerRegisteredAt = registered ? new Date().toISOString() : undefined;
        } catch (error) {
          trackerState.warning = error?.message || "Delivery Tracker webhook registration failed.";
        }
      } else {
        trackerState.warning = "Delivery Tracker credentials are not configured, so tracking updates remain manual.";
      }
    }

    const shipment = await updateShipment(context.env, {
      ...data,
      trackingUrl,
      trackerRegisteredAt,
    });

    if (!shipment) {
      throw Object.assign(new Error("주문 배송 정보를 저장하지 못했습니다."), {
        status: 404,
      });
    }

    const order = await readOrderSyncSnapshot(context.env, parsed.data.orderId);

    return json(context.env, {
      ok: true,
      shipment: mapShipmentResponse(shipment),
      order,
      deliveryTracker: trackerState,
      config,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to update fulfillment status.");
  }
}