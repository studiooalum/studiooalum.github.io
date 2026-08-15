import { imageUrl } from "./sanity/image.js";
import {
  getWorkshopPoster,
  getWorkshopShortDescription,
  getWorkshopSlug,
  normalizeWorkshop,
} from "./utils/workshops-20260809-02.js";
import { buildBreadcrumbList, setJsonLd, toAbsoluteUrl, truncateDescription, updatePageSeo } from "./utils/seo.js";

const dom = {
  stage: document.getElementById("workshopStage"),
  back: document.getElementById("workshopBack"),
  poster: document.getElementById("workshopPoster"),
  kicker: document.getElementById("workshopKicker"),
  title: document.getElementById("workshopTitle"),
  duration: document.getElementById("workshopDuration"),
  level: document.getElementById("workshopLevel"),
  price: document.getElementById("workshopPrice"),
  description: document.getElementById("workshopDescription"),
  materials: document.getElementById("workshopMaterials"),
  capacity: document.getElementById("workshopCapacity"),
  location: document.getElementById("workshopLocation"),
  bring: document.getElementById("workshopBring"),
  notice: document.getElementById("workshopNotice"),
  gallerySection: document.getElementById("workshopGallerySection"),
  galleryList: document.getElementById("workshopGalleryList"),
  apply: document.getElementById("workshopApplyBtn"),
  rail: document.getElementById("workshopRail"),
  railBackdrop: document.getElementById("workshopRailBackdrop"),
  railPanel: document.getElementById("workshopRailPanel"),
  railClose: document.getElementById("workshopRailClose"),
  calendar: document.getElementById("workshopCalendar"),
  calendarToolbar: document.getElementById("calendarToolbar"),
  calendarMonth: document.getElementById("calendarMonth"),
  calendarYear: document.getElementById("calendarYear"),
  calendarPrev: document.getElementById("calendarPrevBtn"),
  calendarNext: document.getElementById("calendarNextBtn"),
  selectedDate: document.getElementById("workshopSelectedDate"),
  slotList: document.getElementById("workshopSlotList"),
  form: document.getElementById("workshopBookingForm"),
  attendeeCount: document.getElementById("bookingAttendeeCount"),
  bookingPrice: document.getElementById("workshopBookingPrice"),
  bookingName: document.getElementById("bookingName"),
  bookingEmail: document.getElementById("bookingEmail"),
  bookingPhone: document.getElementById("bookingPhone"),
  bookingNote: document.getElementById("bookingNote"),
  submit: document.getElementById("workshopBookingSubmit"),
  cancel: document.getElementById("workshopBookingCancel"),
  feedback: document.getElementById("workshopBookingFeedback"),
};

const query = new URLSearchParams(window.location.search);
const slug = String(query.get("slug") || "").trim();
const isAdminPreview = query.get("preview") === "1";

const state = {
  workshop: null,
  bookingOpen: false,
  selectedDate: "",
  selectedSlotKey: "",
  monthKeys: [],
  activeMonthIndex: 0,
};

let posterResizeHandlerBound = false;

const WORKSHOP_TIME_ZONE = "Asia/Seoul";

function formatDatePartsInZone(date, timeZone = WORKSHOP_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return parts.reduce((accumulator, part) => {
    if (part.type === "year" || part.type === "month" || part.type === "day") {
      accumulator[part.type] = part.value;
    }
    return accumulator;
  }, {});
}

function getTodayDateKey() {
  const parts = formatDatePartsInZone(new Date());
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getMonthKey(dateKey) {
  return String(dateKey || "").slice(0, 7);
}

function enumerateMonthKeys(startMonthKey, endMonthKey) {
  const keys = [];
  const [startYear, startMonth] = String(startMonthKey || "").split("-").map(Number);
  const [endYear, endMonth] = String(endMonthKey || "").split("-").map(Number);
  if (!startYear || !startMonth || !endYear || !endMonth) {
    return keys;
  }

  let cursor = new Date(Date.UTC(startYear, startMonth - 1, 1));
  const last = new Date(Date.UTC(endYear, endMonth - 1, 1));

  while (cursor.getTime() <= last.getTime()) {
    keys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return keys;
}

function formatSlotDisplayTime(value) {
  const [hourText = "00", minuteText = "00"] = String(value || "").split(":");
  const hour = Number(hourText);
  const minute = String(minuteText).padStart(2, "0");
  const suffix = hour < 12 ? "AM" : "PM";
  return `${String(hour).padStart(2, "0")}:${minute} ${suffix}`;
}

async function requestJson(url, { method = "GET", body } = {}) {
  const init = {
    method,
    headers: {
      Accept: "application/json",
    },
    credentials: "same-origin",
  };

  if (isAdminPreview) {
    const adminToken = sessionStorage.getItem("studiooalum:order-admin-access-token") || "";
    if (adminToken) {
      init.headers.Authorization = `Bearer ${adminToken}`;
    }
  }

  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.error || "Request failed.");
    error.status = response.status;
    throw error;
  }

  return payload;
}

function setFeedback(message = "", type = "") {
  if (!dom.feedback) return;
  dom.feedback.textContent = message;
  dom.feedback.classList.toggle("is-error", type === "error");
  dom.feedback.classList.toggle("is-success", type === "success");
}

function formatCurrency(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return "상담 후 확정";
  }

  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatReadableDate(dateText) {
  const value = parseDateKey(dateText);
  if (Number.isNaN(value.getTime())) {
    return dateText;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(value);
}

function formatSlotTime(slot) {
  const start = String(slot?.startTime || "").trim();
  const end = String(slot?.endTime || "").trim();
  if (!start) return slot?.label || "";
  return end ? `${formatSlotDisplayTime(start)} - ${formatSlotDisplayTime(end)}` : formatSlotDisplayTime(start);
}

function splitParagraphs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function setList(container, items, fallbackText) {
  if (!container) return;
  container.innerHTML = "";

  if (!Array.isArray(items) || items.length === 0) {
    const item = document.createElement("li");
    item.textContent = fallbackText;
    container.appendChild(item);
    return;
  }

  for (const value of items) {
    const item = document.createElement("li");
    item.textContent = value;
    container.appendChild(item);
  }
}

function groupSlotsByDate(slots) {
  return slots.reduce((map, slot) => {
    const current = map.get(slot.date) || [];
    current.push(slot);
    map.set(slot.date, current);
    return map;
  }, new Map());
}

function deriveMonthKeys(slots) {
  const sortedDates = Array.from(new Set((slots || []).map((slot) => String(slot.date || "").trim()).filter(Boolean))).sort();
  const startMonthKey = getMonthKey(getTodayDateKey());
  const endMonthKey = getMonthKey(sortedDates[sortedDates.length - 1] || startMonthKey);
  return enumerateMonthKeys(startMonthKey, endMonthKey);
}

function getBookingConfig() {
  const raw = state.workshop?.bookingConfig && typeof state.workshop.bookingConfig === "object"
    ? state.workshop.bookingConfig
    : {};
  return {
    mode: raw.mode === "daily" ? "daily" : "scheduled",
    allowSharedBookings: raw.allowSharedBookings === true,
    attendeePrices: raw.attendeePrices && typeof raw.attendeePrices === "object" ? raw.attendeePrices : {},
  };
}

function findFirstAvailableDate() {
  const slots = state.workshop?.scheduleSlots || [];
  const tomorrowKey = addDaysToDateKey(getTodayDateKey(), 1);
  const first = slots.find((slot) => slot.status !== "blocked" && slot.date >= tomorrowKey);
  return first?.date || "";
}

function getOpenSlotsForDate(dateKey) {
  if (!dateKey) return [];
  return (state.workshop?.scheduleSlots || []).filter((slot) => slot.date === dateKey && slot.status !== "blocked");
}

function getSelectedSlot() {
  return (state.workshop?.scheduleSlots || []).find((slot) => slot.key === state.selectedSlotKey) || null;
}

function getDateAvailability(dateKey) {
  const todayKey = getTodayDateKey();
  const slots = (state.workshop?.scheduleSlots || []).filter((slot) => slot.date === dateKey);
  const openSlots = slots.filter((slot) => slot.status !== "blocked");
  const pastOrToday = dateKey <= todayKey;
  const explicitBlocked = slots.length > 0 && openSlots.length === 0;
  const selectable = !pastOrToday && openSlots.length > 0;

  return {
    slots,
    openSlots,
    selectable,
    pastOrToday,
    explicitBlocked,
  };
}

function syncSelectedSlot() {
  const openSlots = getOpenSlotsForDate(state.selectedDate);
  if (openSlots.length === 0) {
    state.selectedSlotKey = "";
    return;
  }

  const stillSelected = openSlots.find((slot) => slot.key === state.selectedSlotKey);
  if (!stillSelected) {
    state.selectedSlotKey = openSlots[0].key;
  }
}

function syncMonthIndex() {
  const date = state.selectedDate || findFirstAvailableDate();
  const monthKey = date ? date.slice(0, 7) : state.monthKeys[0];
  const nextIndex = state.monthKeys.indexOf(monthKey);
  state.activeMonthIndex = nextIndex >= 0 ? nextIndex : 0;
}

function updatePosterDots(dots, activeIndex) {
  dots.forEach((dot, index) => {
    const isActive = index === activeIndex;
    dot.classList.toggle("is-active", isActive);
    dot.setAttribute("aria-current", isActive ? "true" : "false");
  });
}

function bindPosterDots(track, dots) {
  if (!track || dots.length === 0) return;

  let frameId = null;
  const sync = () => {
    frameId = null;
    const slideWidth = track.clientWidth || 1;
    const nextIndex = Math.max(0, Math.min(dots.length - 1, Math.round(track.scrollLeft / slideWidth)));
    updatePosterDots(dots, nextIndex);
  };

  track.addEventListener("scroll", () => {
    if (frameId != null) return;
    frameId = requestAnimationFrame(sync);
  }, { passive: true });

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      track.scrollTo({
        left: track.clientWidth * index,
        behavior: "smooth",
      });
    });
  });

  if (!posterResizeHandlerBound) {
    posterResizeHandlerBound = true;
    window.addEventListener("resize", sync);
  }

  requestAnimationFrame(sync);
}

function collectPosterItems(workshop) {
  const fromD1Poster = String(workshop.posterImageUrl || "").trim()
    ? [{
      src: String(workshop.posterImageUrl || "").trim(),
      alt: String(workshop.posterImageAlt || workshop.title || "Workshop poster").trim(),
      kind: "poster",
    }]
    : [];

  const fromD1GalleryPosters = Array.isArray(workshop.galleryImages)
    ? workshop.galleryImages
      .filter((item) => String(item?.kind || "").trim() === "poster")
      .map((item) => ({
        src: String(item?.url || "").trim(),
        alt: String(item?.alt || item?.caption || workshop.title || "Workshop poster").trim(),
        kind: "poster",
      }))
    : [];

  const posterAsset = getWorkshopPoster(workshop);
  const fromSanityFallback = imageUrl(posterAsset, { width: 1500, height: 1800 })
    ? [{
      src: imageUrl(posterAsset, { width: 1500, height: 1800 }),
      alt: workshop.title || "Workshop poster",
      kind: "poster",
    }]
    : [];

  const merged = [...fromD1Poster, ...fromD1GalleryPosters, ...fromSanityFallback]
    .filter((item) => item.src)
    .filter((item, index, array) => array.findIndex((target) => target.src === item.src) === index);

  return merged;
}

function renderPoster(workshop) {
  if (!dom.poster) return;
  dom.poster.innerHTML = "";

  const posters = collectPosterItems(workshop);

  if (posters.length === 1) {
    const img = document.createElement("img");
    img.src = posters[0].src;
    img.alt = posters[0].alt || workshop.title || "Workshop poster";
    img.loading = "eager";
    img.decoding = "async";
    dom.poster.appendChild(img);
    return;
  }

  if (posters.length > 1) {
    const sliderEl = document.createElement("div");
    sliderEl.className = "workshop-poster__slider";

    const trackEl = document.createElement("div");
    trackEl.className = "workshop-poster__track";

    const dotsEl = document.createElement("div");
    dotsEl.className = "workshop-poster__dots";
    dotsEl.setAttribute("aria-label", "워크숍 포스터 선택");

    const dots = [];
    posters.forEach((item, index) => {
      const slideEl = document.createElement("div");
      slideEl.className = "workshop-poster__slide";

      const img = document.createElement("img");
      img.src = item.src;
      img.alt = item.alt || workshop.title || "Workshop poster";
      img.loading = index === 0 ? "eager" : "lazy";
      img.decoding = "async";

      slideEl.appendChild(img);
      trackEl.appendChild(slideEl);

      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = `workshop-poster__dot${index === 0 ? " is-active" : ""}`;
      dot.setAttribute("aria-label", `포스터 ${index + 1}`);
      dotsEl.appendChild(dot);
      dots.push(dot);
    });

    sliderEl.appendChild(trackEl);
    dom.poster.append(sliderEl, dotsEl);
    bindPosterDots(trackEl, dots);
    return;
  }

  const fallback = document.createElement("div");
  fallback.className = "workshop-poster__fallback";
  fallback.textContent = workshop.title || "Workshop";
  dom.poster.appendChild(fallback);
}

function renderGallery(workshop) {
  if (!dom.gallerySection || !dom.galleryList) return;

  const fromD1 = Array.isArray(workshop.galleryImages)
    ? workshop.galleryImages.map((item) => ({
        src: String(item?.url || "").trim(),
        alt: String(item?.alt || workshop.title || "Workshop gallery image").trim(),
        caption: String(item?.caption || "").trim(),
        kind: String(item?.kind || "").trim(),
      }))
    : [];
  const fromSanity = Array.isArray(workshop.images)
    ? workshop.images.map((item) => ({
        src: imageUrl(item, { width: 1600, height: 1600 }) || "",
        alt: String(item?.alt || workshop.title || "Workshop gallery image").trim(),
        caption: String(item?.caption || "").trim(),
      }))
    : [];
  const items = (fromD1.length ? fromD1 : fromSanity)
    .filter((item) => item.src)
    .filter((item) => item.kind !== "poster");

  if (!items.length) {
    dom.galleryList.innerHTML = "";
    dom.gallerySection.hidden = true;
    return;
  }

  dom.gallerySection.hidden = false;
  dom.galleryList.innerHTML = items.map((item) => `
    <figure class="workshop-gallery__item">
      <img src="${item.src}" alt="${item.alt}" loading="lazy" decoding="async">
      ${item.caption ? `<figcaption>${item.caption}</figcaption>` : ""}
    </figure>
  `).join("");
}

function renderWorkshopDetails(workshop) {
  const workshopSlug = getWorkshopSlug(workshop) || slug;
  const canonicalUrl = toAbsoluteUrl(`workshop?slug=${encodeURIComponent(workshopSlug)}`);
  const description = truncateDescription(getWorkshopShortDescription(workshop));
  const posterAsset = getWorkshopPoster(workshop);
  const posterUrl = imageUrl(posterAsset, { width: 1200, height: 1600 });

  document.title = `${workshop.title || "Workshop"} | 오알룸 워크숍 | 스튜디오 오알룸`;

  updatePageSeo({
    title: `${workshop.title || "Workshop"} | 오알룸 워크숍 | 스튜디오 오알룸`,
    description,
    canonicalUrl,
    imageUrl: posterUrl,
    robots: "index,follow",
  });

  const courseSchema = {
    "@type": "Course",
    name: workshop.title || "Workshop",
    description,
    url: canonicalUrl,
    provider: {
      "@type": "Organization",
      name: "스튜디오 오알룸",
      url: toAbsoluteUrl("/"),
    },
    image: posterUrl ? [posterUrl] : undefined,
    offers: Number(workshop.price) > 0
      ? {
          "@type": "Offer",
          priceCurrency: "KRW",
          price: String(Number(workshop.price) || 0),
          url: canonicalUrl,
        }
      : undefined,
  };

  setJsonLd("workshop-page", {
    "@context": "https://schema.org",
    "@graph": [
      courseSchema,
      buildBreadcrumbList([
        { name: "오알룸", url: toAbsoluteUrl("/") },
        { name: "오알룸 워크숍", url: toAbsoluteUrl("/workshops") },
        { name: workshop.title || "Workshop", url: canonicalUrl },
      ]),
    ],
  });

  if (dom.back) {
    dom.back.href = workshop.category ? `./workshops?category=${encodeURIComponent(workshop.category)}` : "./workshops";
  }

  if (dom.kicker) {
    dom.kicker.textContent = `workshop / ${workshop.category || "workshop"}`;
  }

  if (dom.title) {
    dom.title.textContent = workshop.title || "Untitled workshop";
  }

  if (dom.duration) {
    dom.duration.textContent = workshop.durationLabel || "TBD";
  }

  if (dom.level) {
    dom.level.textContent = workshop.levelLabel || "all levels";
  }

  if (dom.price) {
    dom.price.textContent = formatCurrency(workshop.price);
  }

  if (dom.description) {
    dom.description.innerHTML = "";
    const paragraphs = splitParagraphs(workshop.description);
    const values = paragraphs.length > 0 ? paragraphs : ["워크숍 설명이 곧 추가됩니다."];
    for (const text of values) {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      dom.description.appendChild(paragraph);
    }
  }

  setList(dom.materials, workshop.materials, "기본 재료는 현장에서 안내됩니다.");
  setList(dom.bring, workshop.thingsToBring, "필요한 준비물은 예약 후 개별 안내됩니다.");

  if (dom.capacity) {
    dom.capacity.textContent = `${workshop.maxCapacity || 0}명 정원`;
  }

  if (dom.location) {
    const details = [workshop.locationName, workshop.locationAddress, workshop.locationDetail]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    dom.location.textContent = details.join(" / ") || "Studio OALUM";
  }

  if (dom.notice) {
    dom.notice.textContent = workshop.bookingNotice || "노란색 날짜는 예약이 막힌 일정입니다. 가능한 날짜를 선택해 신청해 주세요.";
  }

  renderPoster(workshop);
  renderGallery(workshop);
}

function createWeekdayRow() {
  const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const row = document.createElement("div");
  row.className = "workshop-calendar__weekdays";

  for (const label of weekdays) {
    const item = document.createElement("span");
    item.className = "workshop-calendar__weekday";
    item.textContent = label;
    row.appendChild(item);
  }

  return row;
}

function createMonthGrid(monthKey) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const firstDate = new Date(year, month - 1, 1);
  const lastDate = new Date(year, month, 0);
  const grid = document.createElement("div");
  grid.className = "workshop-calendar__grid";

  const sundayFirstIndex = firstDate.getDay();

  for (let emptyIndex = 0; emptyIndex < sundayFirstIndex; emptyIndex += 1) {
    const blank = document.createElement("span");
    blank.className = "workshop-calendar__blank";
    grid.appendChild(blank);
  }

  for (let day = 1; day <= lastDate.getDate(); day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    const availability = getDateAvailability(date);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "workshop-calendar__day";
    button.textContent = String(day);

    if (availability.pastOrToday) {
      button.classList.add("is-past");
      button.disabled = true;
    } else if (availability.explicitBlocked) {
      button.classList.add("is-blocked");
      button.disabled = true;
    } else if (!availability.selectable) {
      button.disabled = true;
    }

    if (state.selectedDate === date) {
      button.classList.add("is-selected");
    }

    if (availability.selectable) {
      button.addEventListener("click", () => {
        state.selectedDate = date;
        const firstOpenSlot = availability.openSlots[0];
        state.selectedSlotKey = firstOpenSlot?.key || "";
        renderBookingRail();
      });
    }

    grid.appendChild(button);
  }

  return grid;
}

function renderCalendar() {
  if (!dom.calendar || !dom.calendarMonth || !dom.calendarYear) return;

  dom.calendar.innerHTML = "";
  if (state.monthKeys.length === 0) {
    dom.calendarMonth.textContent = "00";
    dom.calendarYear.innerHTML = "00<br>00";
    if (dom.calendarToolbar) dom.calendarToolbar.hidden = true;
    return;
  }

  const monthKey = state.monthKeys[state.activeMonthIndex] || state.monthKeys[0];
  const [yearText, monthText] = monthKey.split("-");

  dom.calendarMonth.textContent = monthText;
  dom.calendarYear.innerHTML = `${yearText.slice(0, 2)}<br>${yearText.slice(2)}`;
  if (dom.calendarToolbar) {
    dom.calendarToolbar.hidden = state.monthKeys.length <= 1;
  }
  dom.calendar.append(createWeekdayRow(), createMonthGrid(monthKey));
}

function renderSlots() {
  if (!dom.slotList || !dom.selectedDate) return;

  const selectedSlots = getOpenSlotsForDate(state.selectedDate);
  dom.slotList.innerHTML = "";
  dom.selectedDate.textContent = formatReadableDate(state.selectedDate);

  if (selectedSlots.length === 0) {
    const empty = document.createElement("p");
    empty.className = "workshop-note";
    empty.textContent = "선택한 날짜에 예약 가능한 회차가 없습니다.";
    dom.slotList.appendChild(empty);
    return;
  }

  for (const slot of selectedSlots) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "workshop-slot-btn";

    if (slot.key === state.selectedSlotKey) {
      button.classList.add("is-active");
    }

    const time = document.createElement("span");
    time.className = "workshop-slot-btn__time";
    time.textContent = formatSlotTime(slot) || slot.label;

    button.addEventListener("click", () => {
      state.selectedSlotKey = slot.key;
      renderBookingRail();
    });

    button.append(time);
    dom.slotList.appendChild(button);
  }
}

function renderAttendeeOptions() {
  if (!dom.attendeeCount) return;

  const selectedSlot = getSelectedSlot();
  const maxCount = Math.max(1, Math.min(4, Number(selectedSlot?.remainingCapacity || selectedSlot?.capacity || 1)));
  const previousValue = Number(dom.attendeeCount.value || 1);
  dom.attendeeCount.innerHTML = "";

  for (let count = 1; count <= maxCount; count += 1) {
    const option = document.createElement("option");
    option.value = String(count);
    option.textContent = `${count}명`;
    dom.attendeeCount.appendChild(option);
  }

  dom.attendeeCount.value = String(Math.min(previousValue, maxCount));
  dom.attendeeCount.disabled = !selectedSlot;
  updateBookingPrice();
}

function updateBookingPrice() {
  if (!dom.bookingPrice) return;
  const bookingConfig = getBookingConfig();
  const count = Number(dom.attendeeCount?.value || 1);

  if (bookingConfig.mode !== "daily") {
    const price = Number(state.workshop?.price || 0);
    dom.bookingPrice.hidden = price <= 0;
    dom.bookingPrice.textContent = price > 0 ? `참가비 ${formatCurrency(price)}` : "";
    return;
  }

  const total = Number(bookingConfig.attendeePrices[count] || 0);
  dom.bookingPrice.hidden = total <= 0;
  dom.bookingPrice.textContent = total > 0 ? `${count}인 기준 ${formatCurrency(total)}` : "";
}

function updateSubmitState() {
  if (!dom.submit) return;
  dom.submit.disabled = !state.selectedSlotKey;
}

function applyViewer(viewer) {
  if (!viewer) return;
  if (dom.bookingName && !dom.bookingName.value) dom.bookingName.value = viewer.fullName || "";
  if (dom.bookingEmail && !dom.bookingEmail.value) dom.bookingEmail.value = viewer.email || "";
  if (dom.bookingPhone && !dom.bookingPhone.value) dom.bookingPhone.value = viewer.phone || "";
}

function renderBookingRail() {
  syncMonthIndex();
  syncSelectedSlot();
  renderCalendar();
  renderSlots();
  renderAttendeeOptions();
  updateSubmitState();
}

function openBookingRail() {
  state.bookingOpen = true;
  document.body.classList.add("workshop-booking-open");
  dom.rail?.setAttribute("aria-hidden", "false");

  if (!state.selectedDate) {
    state.selectedDate = findFirstAvailableDate();
  }

  if (!state.selectedSlotKey) {
    const firstOpenSlot = (state.workshop?.scheduleSlots || []).find((slot) => slot.status !== "blocked");
    state.selectedSlotKey = firstOpenSlot?.key || "";
  }

  renderBookingRail();
}

function closeBookingRail() {
  state.bookingOpen = false;
  document.body.classList.remove("workshop-booking-open");
  dom.rail?.setAttribute("aria-hidden", "true");
}

async function loadWorkshop() {
  if (!slug) {
    throw new Error("워크숍 slug가 없습니다.");
  }

  try {
    const previewQuery = isAdminPreview ? "&preview=1" : "";
    const payload = await requestJson(`./api/workshops/availability?slug=${encodeURIComponent(slug)}${previewQuery}`);
    if (payload?.viewer) {
      applyViewer(payload.viewer);
    }
    if (payload?.workshop) {
      return payload.workshop;
    }
  } catch (error) {
    throw new Error(error.message || "워크샵 정보를 불러오지 못했습니다.");
  }

  throw new Error("워크숍 정보를 찾을 수 없습니다.");
}

function attachEvents() {
  dom.apply?.addEventListener("click", openBookingRail);
  dom.railClose?.addEventListener("click", closeBookingRail);
  dom.railBackdrop?.addEventListener("click", closeBookingRail);

  dom.calendarPrev?.addEventListener("click", () => {
    state.activeMonthIndex = Math.max(0, state.activeMonthIndex - 1);
    renderCalendar();
  });

  dom.calendarNext?.addEventListener("click", () => {
    state.activeMonthIndex = Math.min(state.monthKeys.length - 1, state.activeMonthIndex + 1);
    renderCalendar();
  });

  dom.cancel?.addEventListener("click", closeBookingRail);
  dom.attendeeCount?.addEventListener("change", updateBookingPrice);

  dom.form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.selectedSlotKey) {
      setFeedback("먼저 예약할 회차를 선택해 주세요.", "error");
      return;
    }

    dom.submit.disabled = true;

    try {
      const payload = await requestJson("./api/workshops/reservations", {
        method: "POST",
        body: {
          slug: state.workshop.slug,
          slotKey: state.selectedSlotKey,
          attendeeCount: Number(dom.attendeeCount?.value || 1),
          fullName: dom.bookingName?.value || "",
          email: dom.bookingEmail?.value || "",
          phone: dom.bookingPhone?.value || "",
          note: dom.bookingNote?.value || "",
        },
      });

      if (payload?.workshop) {
        state.workshop = payload.workshop;
        state.monthKeys = deriveMonthKeys(payload.workshop.scheduleSlots || []);
      }

      if (dom.bookingNote) {
        dom.bookingNote.value = "";
      }

      renderBookingRail();
      setFeedback(
        payload?.linkedToAccount
          ? "예약이 완료되었습니다. account 페이지에서 바로 확인할 수 있습니다."
          : "예약이 완료되었습니다. 같은 이메일로 로그인하면 account 페이지에서 확인할 수 있습니다.",
        "success",
      );
    } catch (error) {
      setFeedback(error.message || "예약을 저장하지 못했습니다.", "error");
    } finally {
      dom.submit.disabled = false;
      updateSubmitState();
    }
  });
}

async function init() {
  attachEvents();

  try {
    const workshop = await loadWorkshop();
    state.workshop = workshop;
    state.monthKeys = deriveMonthKeys(workshop.scheduleSlots || []);
    state.selectedDate = findFirstAvailableDate();
    state.selectedSlotKey = getOpenSlotsForDate(state.selectedDate)[0]?.key || "";
    renderWorkshopDetails(workshop);
    closeBookingRail();
  } catch (error) {
    console.error(error);
    if (dom.title) dom.title.textContent = "Workshop not found";
    if (dom.description) {
      dom.description.innerHTML = "";
      const paragraph = document.createElement("p");
      paragraph.textContent = error.message || "워크숍 정보를 불러오지 못했습니다.";
      dom.description.appendChild(paragraph);
    }
    if (dom.apply) dom.apply.disabled = true;
  }
}

init();