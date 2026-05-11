import client from "./sanity/client.js";
import { imageUrl } from "./sanity/image.js";
import { ALL_WORKSHOPS_QUERY } from "./sanity/queries.js";
import { getFirstParagraph } from "./utils/catalog.js";

const WORKSHOP_CATEGORIES = [
  { value: "all", label: "all" },
  { value: "beginning", label: "beginning" },
  { value: "repair", label: "repair" },
  { value: "making", label: "making" },
  { value: "for kids", label: "for kids" },
];

const FALLBACK_WORKSHOPS = [
  {
    title: "Begin with Yarn",
    description: "천천히 실을 다루는 기본 손감각과 가장 쉬운 스티치부터 익히는 입문 워크숍입니다.",
    durationLabel: "2h",
    category: "beginning",
  },
  {
    title: "Visible Repair Session",
    description: "해진 옷이나 천 제품을 관찰하고, 흔적을 남기는 수선 방식으로 다시 연결해 보는 시간입니다.",
    durationLabel: "3h",
    category: "repair",
  },
  {
    title: "Soft Object Making",
    description: "오알룸이 좋아하는 질감과 색 조합으로 작은 패브릭 오브제를 함께 만드는 메이킹 클래스입니다.",
    durationLabel: "3.5h",
    category: "making",
  },
  {
    title: "Tiny Hands Club",
    description: "아이들이 실과 천을 안전하게 만지며 형태를 만드는 과정을 즐길 수 있도록 구성한 키즈 워크숍입니다.",
    durationLabel: "90m",
    category: "for kids",
  },
];

const gridEl = document.getElementById("workshopsGrid");
const tagsEl = document.getElementById("workshopsTags");
const activeCategory = normalizeWorkshopCategory(new URLSearchParams(window.location.search).get("category")) || "all";

if (!gridEl || !tagsEl) {
  throw new Error("Workshops DOM is missing required workshops layout elements.");
}

function normalizeWorkshopCategory(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/[-_]+/g, " ");
  if (!raw) return "";

  const aliases = {
    beginner: "beginning",
    beginners: "beginning",
    beginning: "beginning",
    repair: "repair",
    repairing: "repair",
    making: "making",
    maker: "making",
    makers: "making",
    kids: "for kids",
    kid: "for kids",
    children: "for kids",
    "for kids": "for kids",
  };

  return aliases[raw] || raw;
}

function getWorkshopCategory(workshop) {
  return normalizeWorkshopCategory(workshop?.category || workshop?.workshopCategory);
}

function getWorkshopDescription(workshop) {
  return getFirstParagraph(workshop?.summary || workshop?.excerpt || workshop?.description) || "워크숍 설명이 곧 추가됩니다.";
}

function getWorkshopDuration(workshop) {
  return String(workshop?.durationLabel || workshop?.duration || "TBD").trim() || "TBD";
}

function getWorkshopPoster(workshop) {
  if (workshop?.poster?.asset?.url) return workshop.poster;
  if (workshop?.posterImage?.asset?.url) return workshop.posterImage;
  if (workshop?.mainImage?.asset?.url) return workshop.mainImage;
  if (Array.isArray(workshop?.images) && workshop.images[0]?.asset?.url) return workshop.images[0];
  return null;
}

function getWorkshopHref(workshop) {
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

  const title = document.createElement("h2");
  title.className = "workshops-card__title";
  title.textContent = workshop?.title || "Untitled workshop";

  const copy = document.createElement("p");
  copy.className = "workshops-card__copy";
  copy.textContent = getWorkshopDescription(workshop);

  const footer = document.createElement("div");
  footer.className = "workshops-card__footer";

  const duration = document.createElement("span");
  duration.className = "workshops-card__duration";
  duration.textContent = getWorkshopDuration(workshop);

  const categoryEl = document.createElement("span");
  categoryEl.className = "workshops-card__category";
  categoryEl.textContent = category;

  const arrow = document.createElement("span");
  arrow.className = "workshops-card__arrow";
  arrow.innerHTML = createArrowMarkup();

  footer.append(duration, categoryEl, arrow);
  body.append(title, copy, footer);
  card.append(poster, body);
  return card;
}

function renderWorkshops(workshops) {
  const items = Array.isArray(workshops) && workshops.length > 0 ? workshops : FALLBACK_WORKSHOPS;
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