import { hasD1 } from "../../cloudflare/lib/d1.js";
import { getDeliveryTrackerConfig } from "../../cloudflare/lib/delivery-tracker.js";
import { json, noContent } from "../../cloudflare/lib/http.js";
import { getOrderSyncConfig } from "../../cloudflare/lib/order-sync.js";
import { getTossConfig, shouldRequirePersistence } from "../../cloudflare/lib/toss.js";

export function onRequestOptions(context) {
  return noContent(context.env);
}

export function onRequestGet(context) {
  const toss = getTossConfig(context.env);
  const orderSync = getOrderSyncConfig(context.env);
  const deliveryTracker = getDeliveryTrackerConfig(context.env);

  return json(context.env, {
    ok: true,
    service: "studiooalum-pages-functions",
    timestamp: new Date().toISOString(),
    bindings: {
      d1: hasD1(context.env),
      tossClientKey: toss.isClientReady,
      tossSecretKey: toss.isServerReady,
      strictPersistence: shouldRequirePersistence(context.env),
      orderSync: orderSync.isEnabled,
      orderSyncEmails: orderSync.notificationEmails.length > 0,
      deliveryTracker: deliveryTracker.isConfigured,
      deliveryTrackerLink: deliveryTracker.canBuildTrackingLink,
      deliveryTrackerWebhookSecret: deliveryTracker.hasWebhookSecret,
    },
  });
}