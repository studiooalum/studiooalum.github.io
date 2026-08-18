import { imageUrl } from "./sanity/image-20260816-02.js";
import {
  WORKSHOP_CATEGORIES,
  getWorkshopPoster as resolveWorkshopPoster,
  normalizeWorkshop,
  normalizeWorkshopCategory,
} from "./utils/workshops-20260816-01.js";

const gridEl = document.getElementById("workshopsGrid");
const tagsEl = document.getElementById("workshopsTags");
const activeCategory = normalizeWorkshopCategory(new URLSearchParams(window.location.search).get("category")) || "all";

if (!gridEl || !tagsEl) {
  throw new Error("Workshops DOM is missing required workshops layout elements.");
}

function getWorkshopCategory(workshop) {
  return normalizeWorkshopCategory(workshop?.category || workshop?.workshopCategory);
}

function getWorkshopDuration(workshop) {
  return String(workshop?.durationLabel || workshop?.duration || "TBD").trim() || "TBD";
}

function getWorkshopPoster(workshop) {
  return resolveWorkshopPoster(workshop);
}

function getWorkshopLocation(workshop) {
  return String(workshop?.locationName || "Studio OALUM").trim() || "Studio OALUM";
}

function getWorkshopHref(workshop) {
  const slug = String(workshop?.slug || "").trim();
  if (slug) {
    return `./workshop.html?slug=${encodeURIComponent(slug)}`;
  }

  const rawHref = String(workshop?.bookingUrl || workshop?.externalUrl || workshop?.link || "").trim();
  if (!rawHref) return "";
  if (/^(https?:|mailto:|tel:|#)/.test(rawHref)) return rawHref;
  return `./${rawHref.replace(/^\.\//, "")}`;
}

function getWorkshopsPath(category) {
  return category && category !== "all"
    ? `./workshops.html?category=${encodeURIComponent(category)}`
    : "./workshops.html";
}

function renderTags() {
  tagsEl.innerHTML = "";

  for (const tag of WORKSHOP_CATEGORIES) {
    const link = document.createElement("a");
    link.className = tag.value === activeCategory ? "workshops-tag is-active" : "workshops-tag";
    link.href = getWorkshopsPath(tag.value);
    link.textContent = tag.label;
    tagsEl.appendChild(link);
  }
}

function createWorkshopCard(workshop) {
  const href = getWorkshopHref(workshop);
  const posterAsset = getWorkshopPoster(workshop);
  const posterUrl = imageUrl(posterAsset, { width: 1200, height: 1200 });
  const card = document.createElement(href ? "a" : "article");

  card.className = `workshops-card${href ? " is-link" : ""}`;

  if (href) {
    card.href = href;
    if (/^https?:/.test(href)) {
      card.target = "_blank";
      card.rel = "noreferrer";
    }
  }

  if (posterUrl) {
    const poster = document.createElement("div");
    poster.className = "workshops-card__poster";
    const image = document.createElement("img");
    image.src = posterUrl;
    image.alt = workshop?.title || "Workshop poster";
    image.loading = "lazy";
    image.draggable = false;
    poster.appendChild(image);
    card.appendChild(poster);
  } else {
    const poster = document.createElement("div");
    poster.className = "workshops-card__poster workshops-card__poster--sample";
    poster.innerHTML = `
      <div class="workshops-card__poster-fallback">
        <span class="workshops-card__sample-eyebrow">Studio OALUM</span>
        <strong class="workshops-card__sample-title">${workshop?.title || "Workshop"}</strong>
      </div>
    `;
    card.appendChild(poster);
  }

  const body = document.createElement("div");
  body.className = "workshops-card__body";

  const title = document.createElement("h2");
  title.className = "workshops-card__title";
  title.textContent = workshop?.title || "Untitled workshop";

  const meta = document.createElement("p");
  meta.className = "workshops-card__copy";
  meta.textContent = [getWorkshopDuration(workshop), getWorkshopLocation(workshop)]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" · ");

  body.append(title, meta);
  card.append(body);
  return card;
}

function renderWorkshops(workshops, { loadError = false } = {}) {
  const items = Array.isArray(workshops)
    ? workshops.map((workshop) => normalizeWorkshop(workshop))
    : [];
  const filtered = activeCategory === "all"
    ? items
    : items.filter((workshop) => getWorkshopCategory(workshop) === activeCategory);

  gridEl.innerHTML = "";

  if (filtered.length === 0) {
    const state = document.createElement("p");
    state.className = "workshops-state";
    state.textContent = loadError
      ? "워크숍 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."
      : items.length && activeCategory !== "all"
        ? "선택한 분류의 워크숍이 없습니다."
        : "현재 진행 중인 워크숍이 없습니다.";
    gridEl.appendChild(state);
    return;
  }

  for (const workshop of filtered) {
    gridEl.appendChild(createWorkshopCard(workshop));
  }
}

async function init() {
  renderTags();

  try {
    const response = await fetch("./api/workshops/catalog", {
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok || !Array.isArray(payload.workshops)) {
      throw new Error(payload?.error || "워크샵 목록을 불러오지 못했습니다.");
    }
    renderWorkshops(payload.workshops);
  } catch (error) {
    console.error("Failed to fetch workshops", error);
    renderWorkshops([], { loadError: true });
  }
}

init();