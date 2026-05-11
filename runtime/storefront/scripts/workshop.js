import client from "./sanity/client.js";
import { imageUrl } from "./sanity/image.js";
import { WORKSHOP_BY_SLUG_QUERY } from "./sanity/queries.js";
import {
  findFallbackWorkshopBySlug,
  getWorkshopPoster,
  normalizeWorkshop,
} from "./utils/workshops.js";

const dom = {
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
  apply: document.getElementById("workshopApplyBtn"),
  railEmpty: document.getElementById("workshopRailEmpty"),
  railPanel: document.getElementById("workshopRailPanel"),
  railClose: document.getElementById("workshopRailClose"),
  calendar: document.getElementById("workshopCalendar"),
  calendarMonth: document.getElementById("calendarMonth"),
  calendarYear: document.getElementById("calendarYear"),
  calendarPrev: document.getElementById("calendarPrevBtn"),
  calendarNext: document.getElementById("calendarNextBtn"),
  selectedDate: document.getElementById("workshopSelectedDate"),
  slotList: document.getElementById("workshopSlotList"),
  form: document.getElementById("workshopBookingForm"),
  bookingName: document.getElementById("bookingName"),
  bookingEmail: document.getElementById("bookingEmail"),
  bookingPhone: document.getElementById("bookingPhone"),
  bookingNote: document.getElementById("bookingNote"),
  submit: document.getElementById("workshopBookingSubmit"),
  feedback: document.getElementById("workshopBookingFeedback"),
};

const query = new URLSearchParams(window.location.search);
const slug = String(query.get("slug") || "").trim();

const state = {
  workshop: null,
  bookingOpen: false,
  selectedDate: "",
  selectedSlotKey: "",
  monthKeys: [],
  activeMonthIndex: 0,
};

async function requestJson(url, { method = "GET", body } = {}) {
  const init = {
    method,
    headers: {
      Accept: "application/json",
    },
    credentials: "same-origin",
  };

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
  const value = new Date(`${dateText}T00:00:00`);
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
  return end ? `${start} - ${end}` : start;
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
  return Array.from(new Set(slots.map((slot) => slot.date.slice(0, 7)))).sort();
}

function findFirstAvailableDate() {
  const slots = state.workshop?.scheduleSlots || [];
  const first = slots.find((slot) => slot.status !== "blocked");
  return first?.date || slots[0]?.date || "";
}

function syncMonthIndex() {
  const date = state.selectedDate || findFirstAvailableDate();
  const monthKey = date ? date.slice(0, 7) : state.monthKeys[0];
  const nextIndex = state.monthKeys.indexOf(monthKey);
  state.activeMonthIndex = nextIndex >= 0 ? nextIndex : 0;
}

function renderPoster(workshop) {
  if (!dom.poster) return;
  dom.poster.innerHTML = "";

  const posterAsset = getWorkshopPoster(workshop);
  const posterUrl = imageUrl(posterAsset, { width: 1500, height: 1800 });

  if (posterUrl) {
    const img = document.createElement("img");
    img.src = posterUrl;
    img.alt = workshop.title || "Workshop poster";
    img.loading = "eager";
    img.decoding = "async";
    dom.poster.appendChild(img);
    return;
  }

  const fallback = document.createElement("div");
  fallback.className = "workshop-poster__fallback";
  fallback.textContent = workshop.title || "Workshop";
  dom.poster.appendChild(fallback);
}

function renderWorkshopDetails(workshop) {
  document.title = `Studio OALUM — ${workshop.title || "Workshop"}`;

  if (dom.back) {
    dom.back.href = workshop.category ? `./workshops.html?category=${encodeURIComponent(workshop.category)}` : "./workshops.html";
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
  const slotsByDate = groupSlotsByDate(state.workshop?.scheduleSlots || []);
  const firstDate = new Date(year, month - 1, 1);
  const lastDate = new Date(year, month, 0);
  const grid = document.createElement("div");
  grid.className = "workshop-calendar__grid";

  for (let emptyIndex = 0; emptyIndex < firstDate.getDay(); emptyIndex += 1) {
    const blank = document.createElement("span");
    blank.className = "workshop-calendar__blank";
    grid.appendChild(blank);
  }

  for (let day = 1; day <= lastDate.getDate(); day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    const slots = slotsByDate.get(date) || [];
    const available = slots.some((slot) => slot.status !== "blocked");
    const blocked = slots.length > 0 && slots.every((slot) => slot.status === "blocked");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "workshop-calendar__day";
    button.textContent = String(day);

    if (slots.length === 0) {
      button.classList.add("is-empty");
      button.disabled = true;
    } else if (blocked) {
      button.classList.add("is-blocked");
      button.disabled = true;
    }

    if (state.selectedDate === date) {
      button.classList.add("is-selected");
    }

    if (available) {
      button.addEventListener("click", () => {
        state.selectedDate = date;
        const firstOpenSlot = slots.find((slot) => slot.status !== "blocked");
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
    dom.calendarMonth.textContent = "TBD";
    dom.calendarYear.textContent = "----";
    return;
  }

  const monthKey = state.monthKeys[state.activeMonthIndex] || state.monthKeys[0];
  const [yearText, monthText] = monthKey.split("-");
  const monthDate = new Date(Number(yearText), Number(monthText) - 1, 1);

  dom.calendarMonth.textContent = new Intl.DateTimeFormat("en-US", { month: "long" }).format(monthDate);
  dom.calendarYear.textContent = yearText;
  dom.calendar.append(createWeekdayRow(), createMonthGrid(monthKey));
}

function renderSlots() {
  if (!dom.slotList || !dom.selectedDate) return;

  const selectedSlots = (state.workshop?.scheduleSlots || []).filter((slot) => slot.date === state.selectedDate);
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

    if (slot.status === "blocked") {
      button.classList.add("is-blocked");
      button.disabled = true;
    }

    if (slot.key === state.selectedSlotKey) {
      button.classList.add("is-active");
    }

    const time = document.createElement("span");
    time.className = "workshop-slot-btn__time";
    time.textContent = formatSlotTime(slot) || slot.label;

    const status = document.createElement("span");
    status.className = "workshop-slot-btn__status";
    status.textContent = slot.status === "blocked"
      ? slot.blockedReason || "예약 불가"
      : `${slot.capacity}명 정원 / 예약 가능`;

    if (slot.status !== "blocked") {
      button.addEventListener("click", () => {
        state.selectedSlotKey = slot.key;
        renderBookingRail();
      });
    }

    button.append(time, status);
    dom.slotList.appendChild(button);
  }
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
  renderCalendar();
  renderSlots();
  updateSubmitState();
}

function openBookingRail() {
  state.bookingOpen = true;
  if (dom.railEmpty) dom.railEmpty.hidden = true;
  if (dom.railPanel) dom.railPanel.hidden = false;

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
  if (dom.railEmpty) dom.railEmpty.hidden = false;
  if (dom.railPanel) dom.railPanel.hidden = true;
}

async function loadWorkshop() {
  if (!slug) {
    throw new Error("워크숍 slug가 없습니다.");
  }

  try {
    const payload = await requestJson(`./api/workshops/availability?slug=${encodeURIComponent(slug)}`);
    if (payload?.viewer) {
      applyViewer(payload.viewer);
    }
    if (payload?.workshop) {
      return payload.workshop;
    }
  } catch (error) {
    console.warn("Workshop availability API is not available; falling back to public Sanity query.", error);
  }

  try {
    const workshop = await client.fetch(WORKSHOP_BY_SLUG_QUERY, { slug });
    if (workshop) {
      return normalizeWorkshop(workshop);
    }
  } catch (error) {
    console.error("Failed to fetch workshop detail", error);
  }

  const fallback = findFallbackWorkshopBySlug(slug);
  if (fallback) {
    return normalizeWorkshop(fallback);
  }

  throw new Error("워크숍 정보를 찾을 수 없습니다.");
}

function attachEvents() {
  dom.apply?.addEventListener("click", openBookingRail);
  dom.railClose?.addEventListener("click", closeBookingRail);

  dom.calendarPrev?.addEventListener("click", () => {
    state.activeMonthIndex = Math.max(0, state.activeMonthIndex - 1);
    renderCalendar();
  });

  dom.calendarNext?.addEventListener("click", () => {
    state.activeMonthIndex = Math.min(state.monthKeys.length - 1, state.activeMonthIndex + 1);
    renderCalendar();
  });

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
    state.selectedSlotKey = (workshop.scheduleSlots || []).find((slot) => slot.status !== "blocked")?.key || "";
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