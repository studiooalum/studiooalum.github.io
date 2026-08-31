import {
  deletePublicContentSnapshot,
  newsletterCatalogSnapshotKey,
  newsletterPostSnapshotKey,
  readPublicContentSnapshot,
  writePublicContentSnapshot,
} from "./public-content-snapshots.js";

function getDb(env) {
  return env?.OALUM_DB || null;
}

function requireDb(env) {
  const database = getDb(env);
  if (!database) {
    throw Object.assign(new Error("D1 바인딩이 아직 준비되지 않았습니다."), { status: 503 });
  }
  return database;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeStatus(value) {
  const status = String(value || "draft").trim().toLowerCase();
  return ["draft", "published", "archived"].includes(status) ? status : "draft";
}

function decodeJson(value, fallback = []) {
  try {
    return JSON.parse(value || "") || fallback;
  } catch {
    return fallback;
  }
}

function normalizeCategories(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(source.map((item) => cleanText(item, 40).toLowerCase()).filter(Boolean))].slice(0, 8);
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`.toUpperCase();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readAttribute(source, name) {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = String(source || "").match(pattern);
  return match ? (match[1] || match[2] || match[3] || "") : "";
}

function sanitizeUrl(value) {
  const raw = cleanText(value, 2000);
  if (!raw) return "";
  if (raw.startsWith("/")) return raw;

  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

const ALLOWED_RICH_TEXT_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "h2",
  "h3",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "figure",
  "figcaption",
  "img",
  "span",
  "hr",
]);

const IMAGE_ALIGNMENTS = new Set(["left", "center", "right"]);
const IMAGE_SIZES = new Set(["small", "medium", "large", "full"]);
const IMAGE_POSITIONS = new Set(["inline", "breakout"]);
const IMAGE_LAYOUTS = new Set(["single", "pair-left", "pair-right"]);
const TEXT_ALIGNMENTS = new Set(["left", "center", "right"]);
const TEXT_ALIGNMENT_TAGS = new Set(["p", "h2", "h3", "blockquote", "li"]);
const ALLOWED_FONT_FAMILIES = new Map([
  ["pretendard", "Pretendard"],
  ["wanted sans", "Wanted Sans"],
  ["gothambook", "GothamBook"],
  ["gothamlight", "GothamLight"],
  ["gothammedium", "GothamMedium"],
  ["gothambold", "GothamBold"],
  ["system-ui", "system-ui"],
  ["arial", "Arial"],
  ["helvetica", "Helvetica"],
  ["verdana", "Verdana"],
  ["tahoma", "Tahoma"],
  ["trebuchet ms", "Trebuchet MS"],
  ["gill sans", "Gill Sans"],
  ["times new roman", "Times New Roman"],
  ["georgia", "Georgia"],
  ["garamond", "Garamond"],
  ["courier new", "Courier New"],
  ["comic sans ms", "Comic Sans MS"],
  ["brush script mt", "Brush Script MT"],
  ["sans-serif", "sans-serif"],
  ["serif", "serif"],
  ["monospace", "monospace"],
  ["cursive", "cursive"],
]);

function sanitizeImageLayoutValue(value, allowedValues) {
  const normalized = cleanText(value, 20).toLowerCase();
  return allowedValues.has(normalized) ? normalized : "";
}

function sanitizeFontSize(value) {
  const raw = cleanText(value, 12).match(/^-?\d+(?:\.\d+)?/i)?.[0] || "";
  const size = Math.round(Number(raw));
  return size >= 8 && size <= 40 ? String(size) : "";
}

function readStyleProperty(source, property) {
  const target = String(property || "").trim().toLowerCase();
  for (const declaration of String(source || "").split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 0) continue;
    const name = declaration.slice(0, separator).trim().toLowerCase();
    if (name === target) return declaration.slice(separator + 1).trim();
  }
  return "";
}

function sanitizeFontFamily(value) {
  const primaryFamily = cleanText(value, 100)
    .split(",")[0]
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase();
  return ALLOWED_FONT_FAMILIES.get(primaryFamily) || "";
}

function toCssFontFamily(value) {
  return /\s/.test(value) ? `"${value}"` : value;
}

export function sanitizeNewsletterHtml(value) {
  const source = cleanText(value, 50000).replace(/<!--[^]*?-->/g, "");

  return source.replace(/<[^>]*>/g, (token) => {
    const match = token.match(/^<\s*(\/?)\s*([a-z0-9]+)([^>]*)>$/i);
    if (!match) return "";

    const [, closing, rawTagName, attributes] = match;
    const tagName = rawTagName.toLowerCase();
    if (!ALLOWED_RICH_TEXT_TAGS.has(tagName)) return "";
    if (closing) return `</${tagName}>`;

    if (tagName === "a") {
      const href = sanitizeUrl(readAttribute(attributes, "href"));
      return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">` : "<a>";
    }

    if (tagName === "img") {
      const src = sanitizeUrl(readAttribute(attributes, "src"));
      if (!src) return "";
      const alt = cleanText(readAttribute(attributes, "alt"), 200);
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`;
    }

    if (tagName === "figure") {
      const alignment = sanitizeImageLayoutValue(readAttribute(attributes, "data-image-align"), IMAGE_ALIGNMENTS);
      const size = sanitizeImageLayoutValue(readAttribute(attributes, "data-image-size"), IMAGE_SIZES);
      const position = sanitizeImageLayoutValue(readAttribute(attributes, "data-image-position"), IMAGE_POSITIONS);
      const layout = sanitizeImageLayoutValue(readAttribute(attributes, "data-image-layout"), IMAGE_LAYOUTS);
      const layoutAttributes = [
        alignment ? ` data-image-align="${alignment}"` : "",
        size ? ` data-image-size="${size}"` : "",
        position ? ` data-image-position="${position}"` : "",
        layout ? ` data-image-layout="${layout}"` : "",
      ].join("");
      return `<figure${layoutAttributes}>`;
    }

    if (TEXT_ALIGNMENT_TAGS.has(tagName) || tagName === "span") {
      const sourceStyle = readAttribute(attributes, "style");
      const alignment = sanitizeImageLayoutValue(
        readAttribute(attributes, "data-text-align") || readStyleProperty(sourceStyle, "text-align"),
        TEXT_ALIGNMENTS,
      );
      const fontSize = sanitizeFontSize(
        readAttribute(attributes, "data-font-size") || readStyleProperty(sourceStyle, "font-size"),
      );
      const fontFamily = tagName === "span"
        ? sanitizeFontFamily(readAttribute(attributes, "data-font-family") || readStyleProperty(sourceStyle, "font-family"))
        : "";
      const inlineStyles = [
        fontSize ? `font-size: ${fontSize}px` : "",
        fontFamily ? `font-family: ${toCssFontFamily(fontFamily)}` : "",
      ].filter(Boolean).join("; ");
      const textAttributes = [
        alignment ? ` data-text-align="${alignment}"` : "",
        fontSize ? ` data-font-size="${fontSize}"` : "",
        fontFamily ? ` data-font-family="${escapeHtml(fontFamily)}"` : "",
        inlineStyles ? ` style="${escapeHtml(inlineStyles)}"` : "",
      ].join("");
      return `<${tagName}${textAttributes}>`;
    }

    return `<${tagName}>`;
  });
}

export function slugifyNewsletterTitle(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function textFromHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatNewsletterPost(row) {
  if (!row) return null;

  const contentHtml = sanitizeNewsletterHtml(row.content_html);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt || textFromHtml(contentHtml).slice(0, 220),
    contentHtml,
    coverImageUrl: row.cover_image_url || "",
    coverImageR2Key: row.cover_image_r2_key || "",
    coverImageAlt: row.cover_image_alt || "",
    categories: normalizeCategories(decodeJson(row.categories_json, [])),
    status: normalizeStatus(row.status),
    publishedAt: row.published_at || "",
    archivedAt: row.archived_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

export async function readNewsletterAdminSnapshot(env) {
  const database = requireDb(env);
  const result = await database
    .prepare(`SELECT * FROM newsletter_posts ORDER BY updated_at DESC, created_at DESC`)
    .all();

  return {
    posts: (result?.results || []).map(formatNewsletterPost).filter(Boolean),
  };
}

async function readPublicNewsletterPostsFromDatabase(env, slug = "") {
  const database = getDb(env);
  if (!database) {
    return undefined;
  }

  const normalizedSlug = cleanText(slug, 120);
  if (normalizedSlug) {
    const row = await database
      .prepare(`SELECT * FROM newsletter_posts WHERE slug = ? AND status = 'published' LIMIT 1`)
      .bind(normalizedSlug)
      .first();
    return formatNewsletterPost(row);
  }

  const result = await database
    .prepare(`SELECT * FROM newsletter_posts WHERE status = 'published' ORDER BY published_at DESC, updated_at DESC`)
    .all();
  return (result?.results || []).map(formatNewsletterPost).filter(Boolean);
}

async function syncPublicNewsletterSnapshots(env, post) {
  const posts = await readPublicNewsletterPostsFromDatabase(env);
  if (!Array.isArray(posts)) return false;

  await writePublicContentSnapshot(env, newsletterCatalogSnapshotKey(), posts);
  if (post?.status === "published") {
    await writePublicContentSnapshot(env, newsletterPostSnapshotKey(post.slug), post);
  } else if (post?.slug) {
    await deletePublicContentSnapshot(env, newsletterPostSnapshotKey(post.slug));
  }
  return true;
}

export async function readPublicNewsletterPosts(env, slug = "") {
  const normalizedSlug = cleanText(slug, 120);
  const snapshotKey = normalizedSlug ? newsletterPostSnapshotKey(normalizedSlug) : newsletterCatalogSnapshotKey();
  const snapshot = await readPublicContentSnapshot(env, snapshotKey);

  if (normalizedSlug ? snapshot && typeof snapshot === "object" : Array.isArray(snapshot)) {
    return snapshot;
  }

  if (normalizedSlug) {
    const catalog = await readPublicContentSnapshot(env, newsletterCatalogSnapshotKey());
    const post = Array.isArray(catalog) ? catalog.find((item) => item?.slug === normalizedSlug) || null : null;
    if (post) {
      await writePublicContentSnapshot(env, snapshotKey, post).catch(() => false);
      return post;
    }
  }

  const result = await readPublicNewsletterPostsFromDatabase(env, normalizedSlug);
  if (result === undefined) return normalizedSlug ? null : [];

  if (normalizedSlug ? result : Array.isArray(result)) {
    await writePublicContentSnapshot(env, snapshotKey, result).catch(() => false);
  }
  return result;
}

export async function upsertNewsletterPost(env, input) {
  const database = requireDb(env);
  const title = cleanText(input.title, 200);
  const slug = cleanText(input.slug, 120) || slugifyNewsletterTitle(title);
  if (!title || !slug) {
    throw Object.assign(new Error("뉴스레터 제목과 slug를 확인해주세요."), { status: 400 });
  }

  const existing = await database.prepare(`SELECT * FROM newsletter_posts WHERE slug = ? LIMIT 1`).bind(slug).first();
  const now = nowIso();
  const status = normalizeStatus(input.status);
  const contentHtml = sanitizeNewsletterHtml(input.contentHtml);
  const publishedAt = status === "published"
    ? cleanText(input.publishedAt, 40) || existing?.published_at || now
    : null;
  const archivedAt = status === "archived" ? existing?.archived_at || now : null;
  const id = cleanText(input.id, 80) || existing?.id || createId("NLP");

  await database
    .prepare(`
      INSERT INTO newsletter_posts (
        id,
        slug,
        title,
        excerpt,
        content_html,
        cover_image_url,
        cover_image_r2_key,
        cover_image_alt,
        categories_json,
        status,
        published_at,
        archived_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        title = excluded.title,
        excerpt = excluded.excerpt,
        content_html = excluded.content_html,
        cover_image_url = excluded.cover_image_url,
        cover_image_r2_key = excluded.cover_image_r2_key,
        cover_image_alt = excluded.cover_image_alt,
        categories_json = excluded.categories_json,
        status = excluded.status,
        published_at = excluded.published_at,
        archived_at = excluded.archived_at,
        updated_at = excluded.updated_at
    `)
    .bind(
      id,
      slug,
      title,
      cleanText(input.excerpt, 500),
      contentHtml,
      sanitizeUrl(input.coverImageUrl),
      cleanText(input.coverImageR2Key, 500),
      cleanText(input.coverImageAlt, 200),
      JSON.stringify(normalizeCategories(input.categories)),
      status,
      publishedAt,
      archivedAt,
      existing?.created_at || now,
      now,
    )
    .run();

  const row = await database.prepare(`SELECT * FROM newsletter_posts WHERE slug = ? LIMIT 1`).bind(slug).first();
  const post = formatNewsletterPost(row);
  await syncPublicNewsletterSnapshots(env, post);
  return post;
}

export async function archiveNewsletterPost(env, { slug }) {
  const database = requireDb(env);
  const normalizedSlug = cleanText(slug, 120);
  if (!normalizedSlug) {
    throw Object.assign(new Error("뉴스레터 slug를 확인해주세요."), { status: 400 });
  }

  const existing = await database.prepare(`SELECT * FROM newsletter_posts WHERE slug = ? LIMIT 1`).bind(normalizedSlug).first();
  if (!existing) {
    throw Object.assign(new Error("뉴스레터 글을 찾을 수 없습니다."), { status: 404 });
  }

  const now = nowIso();
  await database
    .prepare(`UPDATE newsletter_posts SET status = 'archived', archived_at = ?, updated_at = ? WHERE slug = ?`)
    .bind(existing.archived_at || now, now, normalizedSlug)
    .run();

  const row = await database.prepare(`SELECT * FROM newsletter_posts WHERE slug = ? LIMIT 1`).bind(normalizedSlug).first();
  const post = formatNewsletterPost(row);
  await syncPublicNewsletterSnapshots(env, post);
  return post;
}
