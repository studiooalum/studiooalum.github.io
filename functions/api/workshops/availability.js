import { readSession } from "../../../cloudflare/lib/auth.js";
import { requireAdminAccess } from "../../../cloudflare/lib/admin.js";
import { errorResponse, json, noContent } from "../../../cloudflare/lib/http.js";
import { readPublicWorkshopAvailability, readWorkshopAdminAvailability } from "../../../cloudflare/lib/workshops.js";

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const slug = String(url.searchParams.get("slug") || "").trim();
    const preview = url.searchParams.get("preview") === "1";

    if (!slug) {
      throw Object.assign(new Error("워크숍 slug가 필요합니다."), {
        status: 400,
      });
    }

    if (preview) {
      await requireAdminAccess(context);
    }

    const workshop = await (preview
      ? readWorkshopAdminAvailability(context.env, slug)
      : readPublicWorkshopAvailability(context.env, slug));
    const session = await readSession(context.env, context.request, { touch: false }).catch(() => null);

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