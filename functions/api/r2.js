import { errorResponse, json, noContent } from "../../cloudflare/lib/http.js";

function buildImageResponse(object) {
  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("Cache-Control", object.httpMetadata?.cacheControl || "public, max-age=31536000, immutable");
  if (object.httpEtag) {
    headers.set("ETag", object.httpEtag);
  }
  if (object.customMetadata?.filename) {
    headers.set("Content-Disposition", `inline; filename="${String(object.customMetadata.filename).replace(/\"/g, "")}"`);
  }
  return new Response(object.body, { status: 200, headers });
}

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const key = String(url.searchParams.get("key") || "").trim();

    if (!key) {
      return json(context.env, {
        ok: false,
        error: "이미지 key가 필요합니다.",
      }, { status: 400 });
    }

    if (!context.env?.OALUM_R2) {
      return json(context.env, {
        ok: false,
        error: "R2 바인딩이 아직 준비되지 않았습니다.",
      }, { status: 503 });
    }

    const object = await context.env.OALUM_R2.get(key);
    if (!object) {
      return json(context.env, {
        ok: false,
        error: "이미지를 찾을 수 없습니다.",
      }, { status: 404 });
    }

    return buildImageResponse(object);
  } catch (error) {
    return errorResponse(context.env, error, "이미지를 불러오지 못했습니다.");
  }
}