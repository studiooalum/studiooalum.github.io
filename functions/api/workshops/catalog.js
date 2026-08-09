import { readPublicWorkshopCatalog } from "../../../cloudflare/lib/workshops.js";
import { errorResponse, json, noContent } from "../../../cloudflare/lib/http.js";

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    const workshops = await readPublicWorkshopCatalog(context.env);

    return json(context.env, {
      ok: true,
      workshops,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to load workshop catalog.");
  }
}