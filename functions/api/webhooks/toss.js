import { hasD1, persistWebhookEvent } from "../../../cloudflare/lib/d1.js";
import { errorResponse, json, noContent, readJson } from "../../../cloudflare/lib/http.js";

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    const payload = await readJson(context.request);
    const warnings = [];
    let persisted = false;

    if (hasD1(context.env)) {
      try {
        persisted = await persistWebhookEvent(context.env, payload);
      } catch (error) {
        warnings.push(error.message);
      }
    }

    return json(context.env, {
      ok: true,
      received: true,
      persisted,
      warnings,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to process Toss webhook.");
  }
}