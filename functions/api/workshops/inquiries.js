import { createWorkshopInquiry, readCustomWorkshopContent } from "../../../cloudflare/lib/workshop-inquiries.js";
import { errorResponse, json, noContent, readJson } from "../../../cloudflare/lib/http.js";

export function onRequestOptions(context) { return noContent(context.env); }

export async function onRequestGet(context) {
  try {
    return json(context.env, { ok: true, customWorkshop: await readCustomWorkshopContent(context.env) });
  } catch (error) {
    return errorResponse(context.env, error);
  }
}

export async function onRequestPost(context) {
  try {
    const result = await createWorkshopInquiry(context.env, await readJson(context.request));
    return json(context.env, { ok: true, ...result }, { status: 201 });
  } catch (error) {
    return errorResponse(context.env, error);
  }
}