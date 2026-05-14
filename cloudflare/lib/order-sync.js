const ORDER_SYNC_SOURCE = "studiooalum-pages";

function parseEmailList(value) {
  return Array.from(new Set(
    String(value || "")
      .split(/[\n,;]/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  ));
}

function normalizeStatus(status) {
  return String(status || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function signPayload(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function buildEmailKey(eventType, order) {
  return `${eventType}:${order?.payment?.paymentKey || order?.orderId || "unknown"}`;
}

function logSyncError(error, event) {
  console.error("Order sync failed.", {
    message: error?.message || String(error),
    eventType: event?.eventType || null,
    orderId: event?.order?.orderId || null,
  });
}

export function getOrderSyncConfig(env) {
  const webhookUrl = String(env?.ORDER_SYNC_WEBHOOK_URL || "").trim();
  const sharedSecret = String(env?.ORDER_SYNC_SHARED_SECRET || "").trim();
  const notificationEmails = parseEmailList(env?.ORDER_NOTIFICATION_EMAILS);

  return {
    webhookUrl,
    sharedSecret,
    notificationEmails,
    isEnabled: Boolean(webhookUrl),
  };
}

export function getOrderSyncEventType(status) {
  switch (normalizeStatus(status)) {
    case "DONE":
    case "CONFIRMED":
      return "payment.confirmed";
    case "AUTHORIZED":
      return "payment.authorized";
    case "READY":
    case "IN_PROGRESS":
    case "WAITING_FOR_DEPOSIT":
    case "PENDING":
      return "payment.pending";
    case "PARTIAL_CANCELED":
    case "PARTIAL_CANCELLED":
    case "REFUND":
    case "REFUNDED":
      return "payment.refunded";
    case "CANCELED":
    case "CANCELLED":
      return "payment.cancelled";
    case "ABORTED":
    case "EXPIRED":
    case "FAILED":
      return "payment.failed";
    default:
      return "payment.updated";
  }
}

export function shouldEmailForOrderSyncEvent(eventType) {
  return eventType === "payment.confirmed"
    || eventType === "payment.failed"
    || eventType === "payment.cancelled"
    || eventType === "payment.refunded";
}

export async function sendOrderSyncEvent(env, event) {
  const config = getOrderSyncConfig(env);
  if (!config.isEnabled) {
    return false;
  }

  const payload = {
    version: 1,
    source: ORDER_SYNC_SOURCE,
    eventId: event?.eventId || crypto.randomUUID(),
    eventType: event?.eventType || "order.updated",
    sentAt: event?.sentAt || new Date().toISOString(),
    notificationEmails: Array.isArray(event?.notificationEmails) && event.notificationEmails.length
      ? event.notificationEmails
      : config.notificationEmails,
    order: event?.order || null,
    meta: {
      sendEmail: Boolean(event?.meta?.sendEmail),
      emailKey: String(event?.meta?.emailKey || buildEmailKey(event?.eventType || "order.updated", event?.order)).trim(),
      syncSource: String(event?.meta?.syncSource || "").trim() || null,
      deliveryId: String(event?.meta?.deliveryId || "").trim() || null,
      duplicate: Boolean(event?.meta?.duplicate),
      providerMode: String(
        event?.meta?.providerMode
          || event?.order?.payment?.providerMode
          || "",
      ).trim() || null,
    },
  };

  const serializedPayload = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const signature = config.sharedSecret
    ? await signPayload(config.sharedSecret, `${timestamp}.${serializedPayload}`)
    : "";

  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timestamp,
      signature,
      payload: serializedPayload,
    }),
  });

  const responsePayload = await response.json().catch(() => null);

  if (!response.ok || responsePayload?.ok === false) {
    throw Object.assign(new Error(responsePayload?.error || `Order sync webhook failed: ${response.status}`), {
      status: response.status || 502,
      details: responsePayload,
    });
  }

  return true;
}

export async function dispatchOrderSync(context, event) {
  const config = getOrderSyncConfig(context?.env);
  if (!config.isEnabled) {
    return false;
  }

  if (typeof context?.waitUntil === "function") {
    context.waitUntil(sendOrderSyncEvent(context.env, event).catch((error) => {
      logSyncError(error, event);
    }));
    return true;
  }

  try {
    await sendOrderSyncEvent(context.env, event);
  } catch (error) {
    logSyncError(error, event);
  }

  return true;
}