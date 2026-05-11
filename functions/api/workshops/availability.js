import { readSession } from "../../../cloudflare/lib/auth.js";
import { errorResponse, json, noContent } from "../../../cloudflare/lib/http.js";
import { readWorkshopAvailability } from "../../../cloudflare/lib/workshops.js";

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const slug = String(url.searchParams.get("slug") || "").trim();

    if (!slug) {
      throw Object.assign(new Error("워크숍 slug가 필요합니다."), {
        status: 400,
      });
    }

    const [workshop, session] = await Promise.all([
      readWorkshopAvailability(context.env, slug),
      readSession(context.env, context.request, { touch: false }),
    ]);

    return json(context.env, {
      ok: true,
      workshop,
      viewer: session?.user ? {
        fullName: session.user.fullName || "",
        email: session.user.email || "",
        phone: session.user.phone || "",
      } : null,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to load workshop availability.");
  }
}