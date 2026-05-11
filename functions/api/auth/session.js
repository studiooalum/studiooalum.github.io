import { readSession } from "../../../cloudflare/lib/auth.js";
import { errorResponse, json, noContent } from "../../../cloudflare/lib/http.js";

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    const session = await readSession(context.env, context.request);

    if (!session) {
      return json(context.env, {
        ok: true,
        authenticated: false,
        user: null,
      });
    }

    return json(context.env, {
      ok: true,
      authenticated: true,
      user: session.user,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to read auth session.");
  }
}