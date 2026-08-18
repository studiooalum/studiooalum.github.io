const ARCHIVE_QUERY = `
  *[_type == "archive"] | order(createdDate desc, _createdAt desc) {
    _id,
    title,
    material,
    createdDate,
    size,
    description,
    tags,
    images[]{
      asset->{
        _id,
        url,
        metadata {
          dimensions {
            width,
            height
          },
          palette {
            dominant {
              background
            }
          }
        }
      }
    }
  }
`;

const TAG_PRIORITY = ["all", "work", "repair", "collaboration", "exhibition", "research"];

const state = {
  items: [],
  selectedTag: String(new URLSearchParams(window.location.search).get("tag") || "all").trim().toLowerCase(),
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeTag(value) {
  return String(value || "").trim().toLowerCase();
}

function getYear(value) {
  const match = String(value || "").match(/\d{4}/);
  return match ? match[0] : "";
}

function colorToRgb(value) {
  const match = String(value || "").trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return "";
  return [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16)).join(", ");
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
    rgb: colorToRgb(asset?.metadata?.palette?.dominant?.background),
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
    material: String(item?.material || "").trim(),
    size: String(item?.size || "").trim(),
    description: String(item?.description || "").trim(),
    tags: Array.isArray(item?.tags) ? item.tags.map(normalizeTag).filter(Boolean) : [],
    images,
  };
}

async function fetchArchiveItems() {
  const response = await fetch("/api/sanity/query", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({ query: ARCHIVE_QUERY, params: {} }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok || !Array.isArray(payload.result)) {
    throw new Error(payload?.error || `Archive query failed with status ${response.status}.`);
  }
  return payload.result;
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
    // Sanity palette metadata is the primary color source for cross-origin images.
  }
}

function createArchiveCard(item, imageData) {
  const card = document.createElement("a");
  card.className = "archive-card";
  card.href = `./archive.html?id=${encodeURIComponent(item.id)}`;
  if (imageData.rgb) card.style.setProperty("--archive-hover-rgb", imageData.rgb);

  const media = document.createElement("figure");
  media.className = "archive-card__media";
  const image = document.createElement("img");
  image.className = "archive-card__image";
  if (imageData.rgb) image.dataset.imageColor = imageData.rgb;
  image.src = imageData.src;
  image.alt = imageData.alt;
  image.loading = "lazy";
  if (imageData.width) image.width = imageData.width;
  if (imageData.height) image.height = imageData.height;
  if (!imageData.rgb) image.addEventListener("load", () => applyAverageColor(card, image), { once: true });

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

function createDetailImage(imageData, title, className = "") {
  const figure = document.createElement("figure");
  figure.className = `archive-detail-image ${className}`.trim();
  const image = document.createElement("img");
  if (imageData.rgb) image.dataset.imageColor = imageData.rgb;
  image.src = imageData.src;
  image.alt = imageData.alt || title;
  image.loading = className.includes("main") ? "eager" : "lazy";
  if (imageData.width) image.width = imageData.width;
  if (imageData.height) image.height = imageData.height;
  figure.append(image);
  return figure;
}

function renderDetail(shell, item) {
  document.body.classList.add("archive-detail-mode");
  const meta = document.createElement("aside");
  meta.className = "archive-detail-meta";
  const tags = item.tags.length ? item.tags : ["archive"];
  meta.innerHTML = `
    <a class="archive-detail-back" href="./archive.html">← Archive</a>
    <h1>${escapeHtml(item.title)}</h1>
    <p class="archive-detail-year">${getYear(item.createdDate) || "-"}</p>
    <div class="archive-detail-meta__more">
      ${item.material ? `<p><span>Material</span>${escapeHtml(item.material)}</p>` : ""}
      ${item.size ? `<p><span>Size</span>${escapeHtml(item.size)}</p>` : ""}
      <p><span>Tags</span>${tags.map(escapeHtml).join(" · ")}</p>
      ${item.description ? `<p class="archive-detail-description">${escapeHtml(item.description)}</p>` : ""}
    </div>
  `;

  const gallery = document.createElement("section");
  gallery.className = "archive-detail-gallery";
  item.images.forEach((image, index) => gallery.append(createDetailImage(image, item.title, index === 0 ? "archive-detail-image--main" : "")));

  const related = state.items
    .filter((candidate) => candidate.id !== item.id)
    .sort((left, right) => {
      const leftScore = left.tags.filter((tag) => item.tags.includes(tag)).length;
      const rightScore = right.tags.filter((tag) => item.tags.includes(tag)).length;
      return rightScore - leftScore;
    })
    .slice(0, 4);
  if (related.length) {
    const section = document.createElement("section");
    section.className = "archive-related";
    const heading = document.createElement("h2");
    heading.textContent = "You may also like";
    const grid = document.createElement("div");
    grid.className = "archive-related__grid";
    related.forEach((candidate) => {
      if (candidate.images[0]) grid.append(createArchiveCard(candidate, candidate.images[0]));
    });
    section.append(heading, grid);
    gallery.append(section);
  }
  shell.replaceChildren(meta, gallery);

  const syncMeta = () => {
    const threshold = Math.max(80, window.innerHeight * 0.16);
    meta.classList.toggle("is-expanded", window.scrollY > threshold);
  };
  window.addEventListener("scroll", syncMeta, { passive: true });
  syncMeta();
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

function renderBoard(board, loadError = null) {
  if (!board) return;
  const items = getFilteredItems();
  board.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("section");
    empty.className = "archive-empty";
    const label = document.createElement("p");
    label.className = "archive-empty__label";
    label.textContent = loadError ? "Unavailable" : state.items.length ? "No results" : "No records yet";
    const title = document.createElement("h2");
    title.textContent = loadError
      ? "작업 기록을 불러오지 못했습니다."
      : state.items.length
        ? "선택한 기록이 없습니다."
        : "아직 공개된 작업 기록이 없습니다.";
    const copy = document.createElement("p");
    copy.className = "archive-empty__copy";
    copy.textContent = loadError
      ? "잠시 후 다시 시도해주세요."
      : state.items.length
        ? "다른 태그를 선택해 작업 기록을 살펴보세요."
        : "스튜디오 오알룸이 만들어오고 고쳐온 작업을 차례로 공개합니다.";
    empty.append(label, title, copy);
    board.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    if (item.images[0]) fragment.append(createArchiveCard(item, item.images[0]));
  }
  board.append(fragment);
}

export async function initArchiveBoard() {
  const board = document.querySelector("#archiveBoard");
  const tagsElement = document.querySelector("#archiveTags");
  if (!board) return;

  let loadError = null;
  try {
    const result = await fetchArchiveItems();
    state.items = result.map(normalizeArchiveItem).filter((item) => item.images.length > 0);
  } catch (error) {
    loadError = error;
    state.items = [];
    console.error("Failed to load Archive content", error);
  }

  renderTags(tagsElement);
  const detailId = String(new URLSearchParams(window.location.search).get("id") || "").trim();
  const detailItem = detailId ? state.items.find((item) => item.id === detailId) : null;
  if (detailItem) {
    renderDetail(document.querySelector(".archive-shell"), detailItem);
  } else {
    renderBoard(board, loadError);
  }

  tagsElement?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-archive-tag]");
    if (!button) return;
    const nextTag = button.dataset.archiveTag || "all";
    if (detailItem) {
      window.location.href = nextTag === "all" ? "./archive.html" : `./archive.html?tag=${encodeURIComponent(nextTag)}`;
      return;
    }
    state.selectedTag = nextTag;
    renderTags(tagsElement);
    renderBoard(board);
  });
}