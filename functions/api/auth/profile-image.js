import { readUserProfileImageKey, requireSession, updateUserProfileImageKey } from "../../../cloudflare/lib/auth.js";
import { errorResponse, json, noContent } from "../../../cloudflare/lib/http.js";
import { buildProfileImageKey } from "../../../cloudflare/lib/r2.js";

const MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export function onRequestOptions(context) { return noContent(context.env); }

export async function onRequestGet(context) {
  try {
    const session = await requireSession(context.env, context.request);
    const key = await readUserProfileImageKey(context.env, session.user.id);
    if (!key || !context.env.OALUM_R2) throw Object.assign(new Error("프로필 사진을 찾을 수 없습니다."), { status: 404 });
    const object = await context.env.OALUM_R2.get(key);
    if (!object) throw Object.assign(new Error("프로필 사진을 찾을 수 없습니다."), { status: 404 });
    return new Response(object.body, { headers: {
      "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return errorResponse(context.env, error, "프로필 사진을 불러오지 못했습니다."); }
}

export async function onRequestPost(context) {
  let uploadedKey = "";
  try {
    const session = await requireSession(context.env, context.request);
    if (!context.env.OALUM_R2) throw Object.assign(new Error("이미지 저장소가 준비되지 않았습니다."), { status: 503 });
    if (!String(context.request.headers.get("Content-Type") || "").toLowerCase().includes("multipart/form-data")) {
      throw Object.assign(new Error("프로필 사진 형식을 다시 확인해주세요."), { status: 415 });
    }
    const file = (await context.request.formData()).get("image");
    if (!(file instanceof File) || !ALLOWED_PROFILE_IMAGE_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_PROFILE_IMAGE_SIZE) {
      throw Object.assign(new Error("5MB 이하 JPG, PNG, WEBP, AVIF 이미지를 선택해주세요."), { status: 400 });
    }
    uploadedKey = buildProfileImageKey({ userId: session.user.id, fileType: file.type });
    await context.env.OALUM_R2.put(uploadedKey, file.stream(), {
      httpMetadata: { contentType: file.type, cacheControl: "private, no-store" },
      customMetadata: { userId: session.user.id },
    });
    const previousKey = await updateUserProfileImageKey(context.env, session.user.id, uploadedKey);
    if (previousKey && previousKey !== uploadedKey) await context.env.OALUM_R2.delete(previousKey).catch(() => {});
    return json(context.env, { ok: true, profileImageUrl: `/api/auth/profile-image?v=${Date.now()}` });
  } catch (error) {
    if (uploadedKey && context.env.OALUM_R2) await context.env.OALUM_R2.delete(uploadedKey).catch(() => {});
    return errorResponse(context.env, error, "프로필 사진을 저장하지 못했습니다.");
  }
}