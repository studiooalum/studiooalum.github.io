import { clearSession, clearSessionCookie } from "../../../cloudflare/lib/auth.js";
import { errorResponse, json, noContent } from "../../../cloudflare/lib/http.js";

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    await clearSession(context.env, context.request);

    return json(context.env, {
      ok: true,
      authenticated: false,
    }, {
      headers: {
        "Set-Cookie": clearSessionCookie(context.request, context.env),
      },
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to log out.");
  }
}