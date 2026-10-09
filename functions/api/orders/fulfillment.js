import { z } from "zod";

import {
  buildDeliveryTrackerLink,
  buildDeliveryTrackerWebhookUrl,
  getDeliveryTrackerConfig,
  registerDeliveryTrackerWebhook,
  searchDeliveryTrackerCarriers,
} from "../../../cloudflare/lib/delivery-tracker.js";
import { requireAdminAccess } from "../../../cloudflare/lib/admin.js";
import { latestReturn,publicReturn } from '../../../cloudflare/lib/shop-returns.js';
import { enqueueShopNotification } from "../../../cloudflare/lib/notifications.js";
import { deleteUnpaidOrder, readFulfillmentOrders, readOrderSyncSnapshot, updateShipment } from "../../../cloudflare/lib/d1.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const shipmentUpdateSchema = z.object({
  orderId: z.string().trim().min(1).max(80),
  status: z.enum(["confirmed", "ready", "shipped", "delivered", "returned", "cancelled"]),
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

const orderDeleteSchema = z.object({
  orderId: z.string().trim().min(1).max(80),
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
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    await requireAdminAccess(context);

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
        order:{...order,returnRequest:publicReturn(await latestReturn(context.env.OALUM_DB,orderId))},
        config,
      });
    }

    const orders = await readFulfillmentOrders(context.env, { query, limit });
    for(const order of orders) order.returnRequest=publicReturn(await latestReturn(context.env.OALUM_DB,order.orderId));

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
    await requireAdminAccess(context);

    const payload = await readJson(context.request);
    const parsed = shipmentUpdateSchema.safeParse(payload);

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const data = parsed.data;
    const existingOrder=await readOrderSyncSnapshot(context.env,data.orderId);
    if(!existingOrder) throw Object.assign(new Error('주문을 찾을 수 없습니다.'),{status:404});
    if(data.status==='cancelled' && !['cancelled','refunded','payment_failed','created'].includes(existingOrder.status)) {
      throw Object.assign(new Error('배송 상태만 취소로 바꾸면 결제는 환불되지 않습니다. 반품·환불 요청에서 승인해주세요.'),{status:409});
    }
    if(existingOrder.shipment?.shippedAt && ['confirmed','ready'].includes(data.status)) throw Object.assign(new Error('발송한 주문은 배송 준비 단계로 되돌릴 수 없습니다. 반품·환불 요청을 처리해주세요.'),{status:409});
    if(['cancelled','refunded'].includes(existingOrder.status) && !['cancelled','returned'].includes(data.status)) throw Object.assign(new Error('취소·환불한 주문은 발송할 수 없습니다.'),{status:409});
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
    if(order) order.returnRequest=publicReturn(await latestReturn(context.env.OALUM_DB,order.orderId));
    if (order && ["shipped", "delivered"].includes(data.status)) {
      await enqueueShopNotification(context.env, order, data.status === "shipped" ? "shipping_started" : "delivered");
    }

    return json(context.env, {
      ok: true,
      shipment: mapShipmentResponse(shipment),
      order,
      deliveryTracker: trackerState,
      config,
    });
  } catch (error) {
    if (/RETURN_PENDING/.test(error?.message || '')) error=Object.assign(new Error('반품·환불 요청이 있는 주문입니다. 요청을 먼저 처리해주세요.'),{status:409});
    return errorResponse(context.env, error, "Failed to update fulfillment status.");
  }
}

export async function onRequestDelete(context) {
  try {
    await requireAdminAccess(context);
    const parsed = orderDeleteSchema.safeParse(await readJson(context.request));
    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const deleted = await deleteUnpaidOrder(context.env, parsed.data.orderId);
    return json(context.env, {
      ok: true,
      message: "미결제 주문을 삭제했습니다.",
      deleted,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to delete order.");
  }
}
