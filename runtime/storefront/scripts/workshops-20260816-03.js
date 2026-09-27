import { imageUrl } from "./sanity/image-20260816-02.js";
import {
  getWorkshopPoster as resolveWorkshopPoster,
  normalizeWorkshop,
} from "./utils/workshops.js";

const tagsEl = document.getElementById("workshopsTags");
const gridEl = document.getElementById("workshopsGrid");
const activeType = String(new URLSearchParams(window.location.search).get("type") || "").trim();
const WORKSHOP_TYPE_FILTERS = [
  { value: "daily", label: "원데이클래스" },
  { value: "event", label: "워크숍" },
  { value: "custom", label: "맞춤 워크숍" },
];

if (!tagsEl || !gridEl) {
  throw new Error("Workshops DOM is missing required workshops layout elements.");
}

function getWorkshopType(workshop) {
  return workshop?.bookingConfig?.workshopType === "daily" ? "daily" : "event";
}

function getWorkshopTypeLabel(workshop) {
  return getWorkshopType(workshop) === "daily" ? "원데이클래스" : "워크숍";
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

function renderTags() {
  tagsEl.innerHTML = "";

  for (const tag of WORKSHOP_TYPE_FILTERS) {
    const control = document.createElement(tag.value === "custom" ? "button" : "a");
    control.className = tag.value === activeType ? "workshops-tag is-active" : "workshops-tag";
    control.textContent = tag.label;
    if (tag.value === "custom") {
      control.type = "button";
      control.addEventListener("click", () => document.getElementById("customWorkshopDialog")?.showModal());
    } else {
      control.href = `./workshops.html?type=${encodeURIComponent(tag.value)}`;
    }
    tagsEl.appendChild(control);
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

  const titleRow = document.createElement("div");
  titleRow.className = "workshops-card__title-row";

  const type = document.createElement("span");
  type.className = "workshops-card__type";
  type.textContent = getWorkshopTypeLabel(workshop);
  const title = document.createElement("h2");
  title.className = "workshops-card__title";
  title.textContent = workshop?.title || "Untitled workshop";
  titleRow.append(title, type);

  const meta = document.createElement("p");
  meta.className = "workshops-card__copy";
  meta.textContent = String(workshop?.summary || workshop?.description || "").trim();

  body.append(titleRow, meta);
  card.append(body);
  return card;
}

function renderWorkshops(workshops) {
  const items = Array.isArray(workshops)
    ? workshops.map((workshop) => normalizeWorkshop(workshop))
    : [];
  const filtered = ["daily", "event"].includes(activeType)
    ? items.filter((workshop) => getWorkshopType(workshop) === activeType)
    : items;

  gridEl.replaceChildren(...filtered.map(createWorkshopCard));
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
  bindInquiryForm();

  try {
    const response = await fetch("./api/workshops/catalog", {
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok || !Array.isArray(payload.workshops)) {
      throw new Error(payload?.error || "워크숍 목록을 불러오지 못했습니다.");
    }
    renderWorkshops(payload.workshops);
  } catch (error) {
    console.error("Failed to fetch workshops", error);
    renderWorkshops([]);
  }
}

init();
