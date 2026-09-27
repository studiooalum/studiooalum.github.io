import { imageUrl } from "./sanity/image-20260816-02.js";
import {
  WORKSHOP_CATEGORIES,
  getWorkshopPoster as resolveWorkshopPoster,
  normalizeWorkshop,
  normalizeWorkshopCategory,
} from "./utils/workshops.js";

const tagsEl = document.getElementById("workshopsTags");
const standardGridEl = document.getElementById("workshopsStandardGrid");
const oneDayGridEl = document.getElementById("workshopsOneDayGrid");
const customGridEl = document.getElementById("workshopsCustomGrid");
const standardCountEl = document.getElementById("workshopsStandardCount");
const oneDayCountEl = document.getElementById("workshopsOneDayCount");
const customCountEl = document.getElementById("workshopsCustomCount");
const activeCategory = normalizeWorkshopCategory(new URLSearchParams(window.location.search).get("category")) || "all";
let customWorkshop = {};

if (!tagsEl || !standardGridEl || !oneDayGridEl || !customGridEl || !standardCountEl || !oneDayCountEl || !customCountEl) {
  throw new Error("Workshops DOM is missing required workshops layout elements.");
}

function getCarouselStep(gridEl) {
  const card = gridEl.querySelector(".workshops-card");
  if (!card) return gridEl.clientWidth;
  const gap = Number.parseFloat(getComputedStyle(gridEl).columnGap) || 0;
  return card.getBoundingClientRect().width + gap;
}

function updateCarouselControls(gridEl) {
  const prevButton = document.querySelector(`[data-carousel-prev="${gridEl.id}"]`);
  const nextButton = document.querySelector(`[data-carousel-next="${gridEl.id}"]`);
  if (!prevButton || !nextButton) return;
  const maxScroll = Math.max(0, gridEl.scrollWidth - gridEl.clientWidth);
  prevButton.disabled = gridEl.scrollLeft <= 1;
  nextButton.disabled = gridEl.scrollLeft >= maxScroll - 1;
}

function bindCarouselControls(gridEl) {
  const prevButton = document.querySelector(`[data-carousel-prev="${gridEl.id}"]`);
  const nextButton = document.querySelector(`[data-carousel-next="${gridEl.id}"]`);
  if (!prevButton || !nextButton) return;
  prevButton.addEventListener("click", () => {
    gridEl.scrollBy({ left: -getCarouselStep(gridEl), behavior: "smooth" });
  });
  nextButton.addEventListener("click", () => {
    gridEl.scrollBy({ left: getCarouselStep(gridEl), behavior: "smooth" });
  });
  gridEl.addEventListener("scroll", () => updateCarouselControls(gridEl), { passive: true });
  window.addEventListener("resize", () => updateCarouselControls(gridEl));
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
  const posterUrl = imageUrl(posterAsset, { width: 1200, height: 750 });
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
    const fallback = document.createElement("div");
    fallback.className = "workshops-card__poster-fallback";
    const label = document.createElement("strong");
    label.className = "workshops-card__sample-title";
    label.textContent = workshop?.title || "Workshop";
    fallback.appendChild(label);
    poster.appendChild(fallback);
    card.appendChild(poster);
  }

  const body = document.createElement("div");
  body.className = "workshops-card__body";

  const metaRow = document.createElement("div");
  metaRow.className = "workshops-card__meta-row";

  const category = document.createElement("span");
  category.className = "workshops-card__category";
  category.textContent = workshop.custom ? "custom" : (getWorkshopCategory(workshop) || "workshop");
  metaRow.appendChild(category);

  const title = document.createElement("h2");
  title.className = "workshops-card__title";
  title.textContent = workshop?.title || "Untitled workshop";

  const meta = document.createElement("p");
  meta.className = "workshops-card__copy";
  meta.textContent = (workshop.custom
    ? ["맞춤 문의"]
    : [workshop.bookingConfig?.mode === "daily" ? "원데이클래스" : "오알룸 워크숍", getWorkshopDuration(workshop)])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

  body.append(metaRow, title, meta);
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
  const standardItems = filtered.filter((workshop) => workshop.bookingConfig?.mode !== "daily");
  const oneDayItems = filtered.filter((workshop) => workshop.bookingConfig?.mode === "daily");

  standardGridEl.innerHTML = "";
  oneDayGridEl.innerHTML = "";
  customGridEl.innerHTML = "";
  standardCountEl.textContent = `${standardItems.length}개의 워크숍`;
  oneDayCountEl.textContent = `${oneDayItems.length}개의 원데이 클래스`;
  customCountEl.textContent = "1개의 맞춤 워크숍";

  for (const workshop of standardItems) standardGridEl.appendChild(createWorkshopCard(workshop));
  for (const workshop of oneDayItems) oneDayGridEl.appendChild(createWorkshopCard(workshop));

  const card = createWorkshopCard({ title: "맞춤 워크숍", custom: true, durationLabel: "",
    poster: customWorkshop.imageUrl ? { asset: { url: customWorkshop.imageUrl } } : null });
  card.setAttribute("href", "#custom-workshop");
  card.setAttribute("role", "button");
  card.tabIndex = 0;
  const openInquiry = () => document.getElementById("customWorkshopDialog").showModal();
  card.addEventListener("click", (event) => { event.preventDefault(); openInquiry(); });
  card.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); openInquiry(); } });
  customGridEl.appendChild(card);
  requestAnimationFrame(() => {
    [standardGridEl, oneDayGridEl, customGridEl].forEach(updateCarouselControls);
  });
}

function bindInquiryForm() {
  const dialog = document.getElementById("customWorkshopDialog");
  const form = document.getElementById("customWorkshopForm");
  const feedback = document.getElementById("customWorkshopFeedback");
  let requestId = crypto.randomUUID();
  document.getElementById("customWorkshopClose").addEventListener("click", () => dialog.close());
  form.elements.locationType.addEventListener("change", () => {
    const other = form.elements.locationType.value === "other";
    document.getElementById("customWorkshopLocationDetail").hidden = !other;
    form.elements.locationDetail.required = other;
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    feedback.textContent = "접수 중...";
    try {
      const body = Object.fromEntries(new FormData(form));
      body.attendeeCount = Number(body.attendeeCount);
      body.privacyConsent = form.elements.privacyConsent.checked;
      body.requestId = requestId;
      const response = await fetch("./api/workshops/inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "문의 접수에 실패했습니다.");
      feedback.textContent = "문의가 접수되었습니다. 확인 후 연락드리겠습니다.";
      form.reset();
      requestId = crypto.randomUUID();
      form.elements.locationType.dispatchEvent(new Event("change"));
    } catch (error) { feedback.textContent = error.message; }
    finally { button.disabled = false; }
  });
}

async function init() {
  renderTags();
  [standardGridEl, oneDayGridEl, customGridEl].forEach(bindCarouselControls);
  bindInquiryForm();

  try {
    const customResponse = await fetch("./api/workshops/inquiries");
    const customPayload = await customResponse.json();
    customWorkshop = customPayload.customWorkshop || {};
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
