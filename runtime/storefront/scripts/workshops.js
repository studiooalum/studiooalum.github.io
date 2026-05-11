import client from "./sanity/client.js";
import { imageUrl } from "./sanity/image.js";
import { ALL_WORKSHOPS_QUERY } from "./sanity/queries.js";
import {
  FALLBACK_WORKSHOPS,
  WORKSHOP_CATEGORIES,
  getWorkshopLevelLabel,
  getWorkshopPoster as resolveWorkshopPoster,
  normalizeWorkshop,
  normalizeWorkshopCategory,
} from "./utils/workshops.js";

const gridEl = document.getElementById("workshopsGrid");
const tagsEl = document.getElementById("workshopsTags");
const activeCategory = normalizeWorkshopCategory(new URLSearchParams(window.location.search).get("category")) || "all";

if (!gridEl || !tagsEl) {
  throw new Error("Workshops DOM is missing required workshops layout elements.");
}

function getWorkshopCategory(workshop) {
  return normalizeWorkshopCategory(workshop?.category || workshop?.workshopCategory);
}

function getWorkshopDescription(workshop) {
  return workshop?.summary || workshop?.description || "워크숍 설명이 곧 추가됩니다.";
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

function createIconMarkup(type) {
  const icons = {
    time: '<svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="9" cy="9" r="6.25" stroke="currentColor" stroke-width="1.2"/><path d="M9 5.2V9.1L11.9 10.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="square"/></svg>',
    level: '<svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3.75 12.75L8.4 8.1L10.95 10.65L14.25 7.35" stroke="currentColor" stroke-width="1.2" stroke-linecap="square" stroke-linejoin="miter"/><path d="M11.85 7.35H14.25V9.75" stroke="currentColor" stroke-width="1.2" stroke-linecap="square"/></svg>',
    place: '<svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9 15.3C11.7 12.15 13.05 9.825 13.05 8.325C13.05 6.088 11.237 4.275 9 4.275C6.763 4.275 4.95 6.088 4.95 8.325C4.95 9.825 6.3 12.15 9 15.3Z" stroke="currentColor" stroke-width="1.2"/><circle cx="9" cy="8.325" r="1.5" fill="currentColor"/></svg>',
  };

  return icons[type] || icons.time;
}

function createMetaItem(type, label, value) {
  const item = document.createElement("div");
  item.className = "workshops-card__meta-item";

  const icon = document.createElement("span");
  icon.className = "workshops-card__meta-icon";
  icon.innerHTML = createIconMarkup(type);

  const body = document.createElement("div");
  body.className = "workshops-card__meta-copy";

  const eyebrow = document.createElement("span");
  eyebrow.className = "workshops-card__meta-label";
  eyebrow.textContent = label;

  const text = document.createElement("span");
  text.className = "workshops-card__meta-value";
  text.textContent = value;

  body.append(eyebrow, text);
  item.append(icon, body);
  return item;
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

function createArrowMarkup() {
  return `
    <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3 15L15 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="square"/>
      <path d="M7 3H15V11" stroke="currentColor" stroke-width="1.4" stroke-linecap="square"/>
    </svg>
  `;
}

function createWorkshopCard(workshop) {
  const href = getWorkshopHref(workshop);
  const category = getWorkshopCategory(workshop) || "beginning";
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

  const poster = document.createElement("div");
  poster.className = "workshops-card__poster";
  poster.dataset.category = category;

  if (posterUrl) {
    const img = document.createElement("img");
    img.src = posterUrl;
    img.alt = workshop?.title || "Workshop poster";
    img.loading = "lazy";
    img.draggable = false;
    poster.appendChild(img);
  } else {
    const fallback = document.createElement("span");
    fallback.className = "workshops-card__poster-fallback";
    fallback.textContent = workshop?.title || "Workshop";
    poster.appendChild(fallback);
  }

  const body = document.createElement("div");
  body.className = "workshops-card__body";

  const eyebrow = document.createElement("p");
  eyebrow.className = "workshops-card__eyebrow";
  eyebrow.textContent = `workshop / ${category}`;

  const title = document.createElement("h2");
  title.className = "workshops-card__title";
  title.textContent = workshop?.title || "Untitled workshop";

  const copy = document.createElement("p");
  copy.className = "workshops-card__copy";
  copy.textContent = getWorkshopDescription(workshop);

  const footer = document.createElement("div");
  footer.className = "workshops-card__footer";

  const meta = document.createElement("div");
  meta.className = "workshops-card__meta";

  const duration = document.createElement("span");
  duration.className = "workshops-card__duration";
  duration.textContent = getWorkshopDuration(workshop);

  const categoryEl = document.createElement("span");
  categoryEl.className = "workshops-card__category";
  categoryEl.textContent = getWorkshopLevelLabel(workshop);

  const arrow = document.createElement("span");
  arrow.className = "workshops-card__arrow";
  arrow.innerHTML = createArrowMarkup();

  meta.append(
    createMetaItem("time", "duration", duration.textContent),
    createMetaItem("level", "level", categoryEl.textContent),
    createMetaItem("place", "location", getWorkshopLocation(workshop)),
  );

  const cta = document.createElement("span");
  cta.className = "workshops-card__cta";
  cta.textContent = "see schedule";

  footer.append(cta, arrow);
  body.append(eyebrow, title, copy, meta, footer);
  card.append(poster, body);
  return card;
}

function renderWorkshops(workshops) {
  const items = (Array.isArray(workshops) && workshops.length > 0 ? workshops : FALLBACK_WORKSHOPS).map(normalizeWorkshop);
  const filtered = activeCategory === "all"
    ? items
    : items.filter((workshop) => getWorkshopCategory(workshop) === activeCategory);

  gridEl.innerHTML = "";

  if (filtered.length === 0) {
    gridEl.innerHTML = '<p class="workshops-state">등록된 워크숍이 없습니다.</p>';
    return;
  }

  for (const workshop of filtered) {
    gridEl.appendChild(createWorkshopCard(workshop));
  }
}

async function init() {
  renderTags();
  gridEl.innerHTML = '<p class="workshops-state">Loading workshops...</p>';

  try {
    const workshops = await client.fetch(ALL_WORKSHOPS_QUERY);
    renderWorkshops(workshops);
  } catch (error) {
    console.error("Failed to fetch workshops", error);
    renderWorkshops(FALLBACK_WORKSHOPS);
  }
}

init();