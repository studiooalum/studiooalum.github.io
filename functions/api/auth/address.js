import { readAccountAddress, requireSession } from "../../../cloudflare/lib/auth.js";
import { errorResponse, json, noContent } from "../../../cloudflare/lib/http.js";

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    const session = await requireSession(context.env, context.request);
    const user = await readAccountAddress(context.env, session.user.id);
    return json(context.env, {
      ok: true,
      authenticated: true,
      user: {
        email: user.email || "",
        zipcode: user.zipcode || "",
        address1: user.address1 || "",
        address2: user.address2 || "",
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = errorResponse(context.env, error, "저장된 주소를 불러오지 못했습니다.");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}