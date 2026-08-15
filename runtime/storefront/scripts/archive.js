import sanityClient from "./sanity/client.js";
import { ARCHIVE_QUERY } from "./sanity/queries.js";

const TAG_PRIORITY = ["all", "work", "repair", "collaboration", "exhibition", "research"];

const state = {
  items: [],
  selectedTag: "all",
};

function normalizeTag(value) {
  return String(value || "").trim().toLowerCase();
}

function getYear(value) {
  const match = String(value || "").match(/\d{4}/);
  return match ? match[0] : "";
}

function normalizeArchiveImage(image, index, title) {
  const asset = image?.asset;
  const source = String(asset?.url || "").trim();
  if (!source) return null;

  const dimensions = asset?.metadata?.dimensions || {};
  return {
    id: asset?._id || `${title}-${index}`,
    src: source,
    alt: `${title} 이미지 ${index + 1}`,
    width: Number(dimensions.width || 0),
    height: Number(dimensions.height || 0),
  };
}

function normalizeArchiveItem(item, index) {
  const title = String(item?.title || `Archive ${index + 1}`).trim();
  const images = Array.isArray(item?.images)
    ? item.images.map((image, imageIndex) => normalizeArchiveImage(image, imageIndex, title)).filter(Boolean)
    : [];

  return {
    id: item?._id || `archive-${index}`,
    title,
    createdDate: String(item?.createdDate || "").trim(),
    tags: Array.isArray(item?.tags)
      ? item.tags.map(normalizeTag).filter(Boolean)
      : [],
    images,
  };
}

function getOrderedTags(items) {
  const available = new Set(items.flatMap((item) => item.tags));
  const priority = TAG_PRIORITY.filter((tag) => tag === "all" || available.has(tag));
  const extras = Array.from(available)
    .filter((tag) => !TAG_PRIORITY.includes(tag))
    .sort((left, right) => left.localeCompare(right, "ko"));

  return [...priority, ...extras];
}

function getFilteredItems() {
  if (state.selectedTag === "all") return state.items;
  return state.items.filter((item) => item.tags.includes(state.selectedTag));
}

function applyAverageColor(card, image) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    context.drawImage(image, 0, 0, 16, 16);
    const pixels = context.getImageData(0, 0, 16, 16).data;
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 32) continue;
      red += pixels[index];
      green += pixels[index + 1];
      blue += pixels[index + 2];
      count += 1;
    }

    if (count) {
      card.style.setProperty("--archive-hover-rgb", `${Math.round(red / count)}, ${Math.round(green / count)}, ${Math.round(blue / count)}`);
    }
  } catch {
    // Cross-origin image pixels may be unavailable; the black overlay remains readable.
  }
}

function createArchiveCard(item, imageData) {
  const card = document.createElement("article");
  card.className = "archive-card";
  card.tabIndex = 0;

  const media = document.createElement("figure");
  media.className = "archive-card__media";
  const image = document.createElement("img");
  image.className = "archive-card__image";
  image.crossOrigin = "anonymous";
  image.src = imageData.src;
  image.alt = imageData.alt;
  image.loading = "lazy";
  if (imageData.width) image.width = imageData.width;
  if (imageData.height) image.height = imageData.height;
  image.addEventListener("load", () => applyAverageColor(card, image), { once: true });

  const overlay = document.createElement("div");
  overlay.className = "archive-card__overlay";
  const title = document.createElement("span");
  title.className = "archive-card__overlay-title";
  title.textContent = item.title;
  const year = document.createElement("span");
  year.className = "archive-card__overlay-year";
  year.textContent = getYear(item.createdDate) || "-";
  overlay.append(title, year);
  media.append(image, overlay);
  card.append(media);
  return card;
}

function renderTags(tagsElement) {
  if (!tagsElement) return;
  const fragment = document.createDocumentFragment();
  for (const tag of getOrderedTags(state.items)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "archive-tags__button";
    button.dataset.archiveTag = tag;
    button.textContent = tag;
    button.setAttribute("aria-pressed", String(tag === state.selectedTag));
    fragment.append(button);
  }
  tagsElement.replaceChildren(fragment);
}

function renderBoard(board, status) {
  if (!board) return;
  const items = getFilteredItems();
  board.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "archive-empty";
    empty.textContent = state.items.length
      ? "선택한 태그의 아카이브 기록이 없습니다."
      : "아카이브 게시물을 준비하고 있습니다.";
    board.append(empty);
    if (status) status.textContent = empty.textContent;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    for (const imageData of item.images) {
      fragment.append(createArchiveCard(item, imageData));
    }
  }
  board.append(fragment);
  if (status) status.textContent = `${items.length}개의 아카이브 기록을 표시하고 있습니다.`;
}

export async function initArchiveBoard() {
  const board = document.querySelector("#archiveBoard");
  const tagsElement = document.querySelector("#archiveTags");
  const status = document.querySelector(".js-archive-status");
  if (!board) return;

  try {
    const result = await sanityClient.fetch(ARCHIVE_QUERY);
    state.items = Array.isArray(result)
      ? result.map(normalizeArchiveItem).filter((item) => item.images.length > 0)
      : [];
  } catch {
    state.items = [];
  }

  renderTags(tagsElement);
  renderBoard(board, status);

  tagsElement?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-archive-tag]");
    if (!button) return;
    state.selectedTag = button.dataset.archiveTag || "all";
    renderTags(tagsElement);
    renderBoard(board, status);
  });
}