import { z } from "zod";

import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const SANITY_PROJECT_ID = "9bsud0bl";
const SANITY_DATASET = "production";
const SANITY_API_VERSION = "2023-01-01";
const SANITY_USE_CDN = true;

const querySchema = z.object({
  query: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional().default({}),
});

function getSanityBaseUrl() {
  const apiHost = SANITY_USE_CDN
    ? `https://${SANITY_PROJECT_ID}.apicdn.sanity.io`
    : `https://${SANITY_PROJECT_ID}.api.sanity.io`;

  return `${apiHost}/v${SANITY_API_VERSION}/data/query/${SANITY_DATASET}`;
}

async function fetchSanityQuery(query, params = {}) {
  const url = new URL(getSanityBaseUrl());
  url.searchParams.set("query", query);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(`$${key}`, JSON.stringify(value));
  });

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw Object.assign(new Error(`Sanity query failed: ${response.status} ${response.statusText}${body ? `\n${body}` : ""}`), {
      status: response.status,
    });
  }

  const payload = await response.json();
  if (payload?.error) {
    throw Object.assign(new Error(payload.error.description || payload.error.message || "Sanity query failed."), {
      status: 502,
    });
  }

  return payload?.result || [];
}

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const body = await readJson(context.request);
    const parsed = querySchema.safeParse(body);

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const result = await fetchSanityQuery(parsed.data.query, parsed.data.params);

    return json(context.env, {
      ok: true,
      result,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to query Sanity.");
  }
}