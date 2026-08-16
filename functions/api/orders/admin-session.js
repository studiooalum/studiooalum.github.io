import { z } from "zod";

import { createAdminSession, getAdminSessionTtlMs, requireAdminAccess, revokeAdminSession } from "../../../cloudflare/lib/admin.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const adminSessionSchema = z.object({
  adminSecret: z.string().trim().min(1).max(512),
});

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    const session = await requireAdminAccess(context);

    return json(context.env, {
      ok: true,
      authenticated: true,
      expiresAt: session.expiresAt,
      ttlMs: getAdminSessionTtlMs(),
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to verify admin session.");
  }
}

export async function onRequestPost(context) {
  try {
    const payload = await readJson(context.request);
    const parsed = adminSessionSchema.safeParse(payload);

    if (!parsed.success) {
      return validationError(context.env, parsed.error);
    }

    const session = await createAdminSession(context.env, parsed.data.adminSecret);

    return json(context.env, {
      ok: true,
      authenticated: true,
      accessToken: session.token,
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
      ttlMs: session.ttlMs,
    });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to create admin session.");
  }
}

export async function onRequestDelete(context) {
  try {
    await requireAdminAccess(context);
    await revokeAdminSession(context);
    return json(context.env, { ok: true, authenticated: false });
  } catch (error) {
    return errorResponse(context.env, error, "Failed to close admin session.");
  }
}