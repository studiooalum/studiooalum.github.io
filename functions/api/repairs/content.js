import { readRepairStudioContent } from "../../../cloudflare/lib/repair-studio-content.js";
import { errorResponse, json, noContent } from "../../../cloudflare/lib/http.js";

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    return json(context.env, { ok: true, content: await readRepairStudioContent(context.env) });
  } catch (error) {
    return errorResponse(context.env, error, "Repair Studio 콘텐츠를 불러오지 못했습니다.");
  }
}