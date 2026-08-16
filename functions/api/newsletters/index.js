import { z } from "zod";

import { readSession } from "../../../cloudflare/lib/auth.js";
import { readPublicNewsletterPosts } from "../../../cloudflare/lib/newsletters.js";
import { errorResponse, json, noContent, readJson, validationError } from "../../../cloudflare/lib/http.js";

const subscribeSchema = z.object({
  email: z.string().trim().email().max(320).optional().default(""),
  name: z.string().trim().max(120).optional().default(""),
});

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestPost(context) {
  try {
    if (!context.env?.OALUM_DB) {
      throw Object.assign(new Error("뉴스레터 구독 저장소가 준비되지 않았습니다."), { status: 503 });
    }
    const parsed = subscribeSchema.safeParse(await readJson(context.request));
    if (!parsed.success) return validationError(context.env, parsed.error);
    const session = await readSession(context.env, context.request, { touch: false });
    const email = String(session?.user?.email || parsed.data.email || "").trim().toLowerCase();
    if (!z.string().email().safeParse(email).success) {
      return json(context.env, { ok: false, error: "이메일을 확인해주세요." }, { status: 400 });
    }
    const now = new Date().toISOString();
    await context.env.OALUM_DB.prepare(`
      INSERT INTO newsletter_subscribers (email, name, user_id, subscribed_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET name = excluded.name, user_id = COALESCE(excluded.user_id, user_id), updated_at = excluded.updated_at
    `).bind(email, parsed.data.name, session?.user?.id || null, now, now).run();
    return json(context.env, { ok: true, subscribed: true });
  } catch (error) {
    return errorResponse(context.env, error, "뉴스레터 구독을 저장하지 못했습니다.");
  }
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const slug = String(url.searchParams.get("slug") || "").trim();
    const result = await readPublicNewsletterPosts(context.env, slug);

    return json(context.env, slug ? { ok: true, post: result } : { ok: true, posts: result });
  } catch (error) {
    return errorResponse(context.env, error, "뉴스레터를 불러오지 못했습니다.");
  }
}