const DELIVERY_TRACKER_GRAPHQL_URL = "https://apis.tracker.delivery/graphql";
const DELIVERY_TRACKER_LINK_URL = "https://link.tracker.delivery/track";

export function getDeliveryTrackerConfig(env) {
  const clientId = String(env?.DELIVERY_TRACKER_CLIENT_ID || "").trim();
  const clientSecret = String(env?.DELIVERY_TRACKER_CLIENT_SECRET || "").trim();
  const webhookSecret = String(env?.DELIVERY_TRACKER_WEBHOOK_SECRET || "").trim();
  const explicitWebhookUrl = String(env?.DELIVERY_TRACKER_WEBHOOK_URL || "").trim();

  return {
    clientId,
    clientSecret,
    webhookSecret,
    webhookUrl: explicitWebhookUrl,
    isConfigured: Boolean(clientId && clientSecret),
    canBuildTrackingLink: Boolean(clientId),
    hasWebhookSecret: Boolean(webhookSecret),
  };
}

function requireDeliveryTrackerCredentials(env) {
  const config = getDeliveryTrackerConfig(env);

  if (!config.isConfigured) {
    throw Object.assign(new Error("Delivery Tracker credentials are not configured."), {
      status: 503,
    });
  }

  return config;
}

async function requestDeliveryTracker(env, { query, variables }) {
  const config = requireDeliveryTrackerCredentials(env);
  const response = await fetch(DELIVERY_TRACKER_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `TRACKQL-API-KEY ${config.clientId}:${config.clientSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: variables || {} }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw Object.assign(new Error(payload?.errors?.[0]?.message || "Delivery Tracker request failed."), {
      status: response.status || 502,
      details: payload?.errors || payload || null,
    });
  }

  return payload.data || null;
}

export function buildDeliveryTrackerLink(env, { carrierId, trackingNumber }) {
  const config = getDeliveryTrackerConfig(env);
  if (!config.canBuildTrackingLink) {
    return "";
  }

  const safeCarrierId = String(carrierId || "").trim();
  const safeTrackingNumber = String(trackingNumber || "").trim();
  if (!safeCarrierId || !safeTrackingNumber) {
    return "";
  }

  const url = new URL(DELIVERY_TRACKER_LINK_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("carrier_id", safeCarrierId);
  url.searchParams.set("tracking_number", safeTrackingNumber);
  return url.toString();
}

export function buildDeliveryTrackerWebhookUrl(request, env) {
  const config = getDeliveryTrackerConfig(env);
  const url = config.webhookUrl ? new URL(config.webhookUrl) : new URL(request.url);

  url.pathname = "/api/webhooks/delivery-tracker";
  url.search = "";

  if (config.webhookSecret) {
    url.searchParams.set("token", config.webhookSecret);
  }

  return url.toString();
}

export async function searchDeliveryTrackerCarriers(env, searchText) {
  const safeSearchText = String(searchText || "").trim();
  if (!safeSearchText) {
    return [];
  }

  const data = await requestDeliveryTracker(env, {
    query: `
      query CarrierSearch($searchText: String!) {
        carriers(first: 10, searchText: $searchText) {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `,
    variables: { searchText: safeSearchText },
  });

  return (data?.carriers?.edges || []).map((edge) => ({
    id: edge?.node?.id || "",
    name: edge?.node?.name || edge?.node?.id || "",
  })).filter((carrier) => carrier.id);
}

export async function registerDeliveryTrackerWebhook(env, input) {
  const safeCarrierId = String(input?.carrierId || "").trim();
  const safeTrackingNumber = String(input?.trackingNumber || "").trim();
  const safeCallbackUrl = String(input?.callbackUrl || "").trim();
  const safeExpirationTime = String(input?.expirationTime || "").trim();

  if (!safeCarrierId || !safeTrackingNumber || !safeCallbackUrl || !safeExpirationTime) {
    throw Object.assign(new Error("carrierId, trackingNumber, callbackUrl and expirationTime are required."), {
      status: 400,
    });
  }

  const data = await requestDeliveryTracker(env, {
    query: `
      mutation RegisterTrackWebhook($input: RegisterTrackWebhookInput!) {
        registerTrackWebhook(input: $input)
      }
    `,
    variables: {
      input: {
        carrierId: safeCarrierId,
        trackingNumber: safeTrackingNumber,
        callbackUrl: safeCallbackUrl,
        expirationTime: safeExpirationTime,
      },
    },
  });

  return Boolean(data?.registerTrackWebhook);
}

export async function fetchDeliveryTrackerTrack(env, input) {
  const safeCarrierId = String(input?.carrierId || "").trim();
  const safeTrackingNumber = String(input?.trackingNumber || "").trim();

  if (!safeCarrierId || !safeTrackingNumber) {
    throw Object.assign(new Error("carrierId and trackingNumber are required."), {
      status: 400,
    });
  }

  const data = await requestDeliveryTracker(env, {
    query: `
      query TrackShipment($carrierId: ID!, $trackingNumber: String!) {
        track(carrierId: $carrierId, trackingNumber: $trackingNumber) {
          lastEvent {
            time
            status {
              code
              name
            }
            description
          }
        }
      }
    `,
    variables: {
      carrierId: safeCarrierId,
      trackingNumber: safeTrackingNumber,
    },
  });

  return data?.track || null;
}

function normalizeTrackerText(...values) {
  return values
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase())
    .join(" ");
}

export function mapDeliveryTrackerTrackToShipment(track, currentStatus = "confirmed") {
  const lastEvent = track?.lastEvent || null;
  const haystack = normalizeTrackerText(
    lastEvent?.status?.code,
    lastEvent?.status?.name,
    lastEvent?.description,
  );

  let status = currentStatus;
  if (/(return|returned|returning|반송|반품)/.test(haystack)) {
    status = "returned";
  } else if (/(deliver|delivered|배송완료|배달완료|수령완료|전달완료)/.test(haystack)) {
    status = "delivered";
  } else if (/(transit|shipp|out for delivery|배송중|배달출발|이동중|간선|도착)/.test(haystack)) {
    status = "shipped";
  }

  return {
    status,
    trackerLastEventAt: lastEvent?.time || null,
    trackerLastEventCode: lastEvent?.status?.code || "",
    trackerLastEventName: lastEvent?.status?.name || "",
    trackerLastEventDescription: lastEvent?.description || "",
  };
}