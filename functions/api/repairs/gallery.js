import { readRepairGallery } from "../../../cloudflare/lib/repairs.js";
import { errorResponse, json, noContent } from "../../../cloudflare/lib/http.js";

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    return json(context.env, { ok: true, gallery: await readRepairGallery(context.env) });
  } catch (error) {
    return errorResponse(context.env, error, "수선 작업 이미지를 불러오지 못했습니다.");
  }
}