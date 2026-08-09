import sanityClient from "./sanity/client.js";
import { imageUrl } from "./sanity/image.js";

const ARCHIVE_QUERY = `
  *[_type in ["archive", "archiveItem", "archiveEntry"]] | order(coalesce(publishedAt, _createdAt) desc) {
    _id,
    title,
    caption,
    description,
    note,
    year,
    type,
    category,
    span,
    mediaType,
    image { asset->{url} },
    posterImage { asset->{url} },
    mainImage { asset->{url} },
    galleryImages[] { asset->{url} }
  }
`;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeArchiveItem(item, index) {
  const image = item?.image || item?.posterImage || item?.mainImage || item?.galleryImages?.[0] || null;
  const imageSrc = imageUrl(image, { width: 1200 }) || "";

  return {
    id: item?._id || `mock-${index}`,
    title: String(item?.title || `Archive ${index + 1}`).trim(),
    caption: String(item?.caption || item?.category || item?.type || "Archive").trim(),
    description: String(item?.description || item?.note || "").trim(),
    note: String(item?.note || "").trim(),
    year: String(item?.year || "").trim(),
    type: String(item?.type || "archive").trim(),
    span: Math.max(1, Math.min(2, Number(item?.span) || 1)),
    aspect: String(item?.mediaType || item?.aspect || "square").trim(),
    imageSrc,
    accent: String(item?.accent || "").trim(),
  };
}

function renderMedia(item, index) {
  const aspectClass = item.imageSrc ? "archive-card__media--image" : `archive-card__media--${item.aspect}`;
  const accentClass = item.accent || ["archive-card--accent-coral", "archive-card--accent-sand", "archive-card--accent-olive", "archive-card--accent-mustard", "archive-card--accent-plum", "archive-card--accent-rose"][index % 6];

  if (item.imageSrc) {
    return `
      <figure class="archive-card__media ${aspectClass}">
        <img src="${escapeHtml(item.imageSrc)}" alt="${escapeHtml(item.title)}">
        <figcaption class="archive-card__badge">${escapeHtml(item.caption)}</figcaption>
      </figure>
    `;
  }

  return `
    <div class="archive-card__media ${aspectClass} ${accentClass}">
      <div class="archive-card__overlay">
        <p class="archive-card__eyebrow">${escapeHtml(item.year || "Archive")}</p>
        <h2 class="archive-card__headline">${escapeHtml(item.title)}</h2>
      </div>
      <span class="archive-card__badge">${escapeHtml(item.caption)}</span>
    </div>
  `;
}

function renderArchiveBoard(board, items) {
  if (!board) return;

  board.innerHTML = items.map((item, index) => {
    const spanClass = item.span === 2 ? " archive-card--span-2" : "";
    return `
      <article class="archive-card${spanClass}" data-archive-card>
        ${renderMedia(item, index)}
        <div class="archive-card__body">
          <p class="archive-card__kicker">${escapeHtml(item.type || "archive")}</p>
          <h2 class="archive-card__title">${escapeHtml(item.title)}</h2>
          <p class="archive-card__caption">${escapeHtml(item.description)}</p>
          ${item.note ? `<p class="archive-card__note">${escapeHtml(item.note)}</p>` : ""}
        </div>
      </article>
    `;
  }).join("");
}

async function loadArchiveItems() {
  try {
    const items = await sanityClient.fetch(ARCHIVE_QUERY);
    return Array.isArray(items) ? items.map(normalizeArchiveItem).filter((item) => item.imageSrc) : [];
  } catch {
    return [];
  }
}

export async function initArchiveBoard() {
  const board = document.querySelector("[data-archive-board]");
  const status = document.querySelector(".js-archive-status");
  if (!board) return;

  const items = await loadArchiveItems();
  if (!items.length) {
    board.innerHTML = `
      <section class="archive-preparing" aria-label="아카이브 준비 중">
        <p class="archive-preparing__label">Studio OALUM Archive</p>
        <h2>아카이브 준비 중</h2>
        <p>이미지와 기록을 정리한 뒤 이곳에 차례로 공개합니다.</p>
      </section>
    `;
    if (status) status.textContent = "아카이브 게시물을 준비하고 있습니다.";
    return;
  }

  renderArchiveBoard(board, items);

  if (status) {
    status.textContent = "Sanity 아카이브 데이터를 표시하고 있습니다.";
  }
}