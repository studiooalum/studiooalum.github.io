import { readPublicWorkshopSnapshotCatalog } from "../../../cloudflare/lib/workshop-content.js";
import { errorResponse, json, noContent } from "../../../cloudflare/lib/http.js";
import {
  PUBLIC_CONTENT_CACHE_HEADERS,
  readPublicContentEdgeCache,
  writePublicContentEdgeCache,
} from "../../../cloudflare/lib/public-content-snapshots.js";

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    const cached = await readPublicContentEdgeCache(context.request);
    if (cached) return cached;

    const workshops = await readPublicWorkshopSnapshotCatalog(context.env);

    const response = json(context.env, {
      ok: true,
      workshops,
    }, {
      headers: PUBLIC_CONTENT_CACHE_HEADERS,
    });
    const write = writePublicContentEdgeCache(context.request, response);
    if (typeof context.waitUntil === "function") context.waitUntil(write);
    else await write;
    return response;
  } catch (error) {
    return errorResponse(context.env, error, "Failed to load workshop catalog.");
  }
}