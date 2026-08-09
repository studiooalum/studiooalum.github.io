import { readPublicNewsletterPosts } from "../../../cloudflare/lib/newsletters.js";
import { errorResponse, json, noContent } from "../../../cloudflare/lib/http.js";

export function onRequestOptions(context) {
  return noContent(context.env);
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