const SNAPSHOT_VERSION = 1;
const SNAPSHOT_PREFIX = "public-content-snapshots/v1";

export const PUBLIC_CONTENT_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, s-maxage=60",
  "X-Oalum-Content-Source": "snapshot",
};

function getBucket(env) {
  return env?.OALUM_R2 || null;
}

function getEdgeCache() {
  return globalThis.caches?.default || null;
}

function publicCacheKey(request) {
  return new Request(new URL(request.url).toString(), { method: "GET" });
}

export async function readPublicContentEdgeCache(request) {
  const cache = getEdgeCache();
  if (!cache || request.method !== "GET") return null;

  try {
    return await cache.match(publicCacheKey(request));
  } catch {
    return null;
  }
}

export async function writePublicContentEdgeCache(request, response) {
  const cache = getEdgeCache();
  if (!cache || request.method !== "GET" || !response?.ok) return false;

  try {
    await cache.put(publicCacheKey(request), response.clone());
    return true;
  } catch {
    return false;
  }
}

function snapshotSegment(value, fallback) {
  const raw = String(value || "").trim();
  return encodeURIComponent(raw || fallback);
}

export function newsletterCatalogSnapshotKey() {
  return `${SNAPSHOT_PREFIX}/newsletters/catalog.json`;
}

export function newsletterPostSnapshotKey(slug) {
  return `${SNAPSHOT_PREFIX}/newsletters/posts/${snapshotSegment(slug, "post")}.json`;
}

export function workshopCatalogSnapshotKey() {
  return `${SNAPSHOT_PREFIX}/workshops/catalog.json`;
}

export function workshopSnapshotKey(slug) {
  return `${SNAPSHOT_PREFIX}/workshops/items/${snapshotSegment(slug, "workshop")}.json`;
}

export async function readPublicContentSnapshot(env, key) {
  const bucket = getBucket(env);
  if (!bucket) return null;

  try {
    const object = await bucket.get(key);
    if (!object) return null;
    const payload = JSON.parse(await object.text());
    if (payload?.version !== SNAPSHOT_VERSION || !Object.prototype.hasOwnProperty.call(payload, "value")) {
      return null;
    }
    return payload.value;
  } catch {
    return null;
  }
}

export async function writePublicContentSnapshot(env, key, value) {
  const bucket = getBucket(env);
  if (!bucket) return false;

  await bucket.put(key, JSON.stringify({
    version: SNAPSHOT_VERSION,
    updatedAt: new Date().toISOString(),
    value,
  }), {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      cacheControl: "public, max-age=300, stale-while-revalidate=86400",
    },
  });
  return true;
}

export async function deletePublicContentSnapshot(env, key) {
  const bucket = getBucket(env);
  if (!bucket) return false;
  await bucket.delete(key);
  return true;
}