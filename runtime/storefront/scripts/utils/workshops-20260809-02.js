const WEEKDAY_LABELS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DEFAULT_DAILY_PRICES = { 1: 120000, 2: 200000, 3: 270000, 4: 300000 };

export const WORKSHOP_CATEGORIES = [
  { value: "all", label: "all" },
  { value: "beginning", label: "beginning" },
  { value: "repair", label: "repair" },
  { value: "making", label: "making" },
  { value: "for kids", label: "for kid" },
];

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function toIsoDate(date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function addDays(date, amount) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function findNextWeekday(startDate, weekday) {
  const baseDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const currentWeekday = baseDate.getDay();
  const delta = (weekday - currentWeekday + 7) % 7;
  return addDays(baseDate, delta === 0 ? 7 : delta);
}

function createSlotKey(slug, date, startTime) {
  return `${slug}-${date}-${String(startTime || "").replace(/[^0-9]/g, "")}`;
}

function normalizeTime(value, fallback) {
  const normalized = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(normalized) ? normalized : fallback;
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, date.getDate());
}

export function getWorkshopBookingConfig(workshop = {}) {
  const raw = workshop?.bookingConfig && typeof workshop.bookingConfig === "object" ? workshop.bookingConfig : {};
  const hasExplicitConfig = Object.keys(raw).length > 0;
  const mode = raw.mode === "daily" ? "daily" : "scheduled";
  const rawPrices = raw.attendeePrices && typeof raw.attendeePrices === "object" ? raw.attendeePrices : {};
  const attendeePrices = {};

  for (const count of [1, 2, 3, 4]) {
    attendeePrices[count] = Math.max(0, Number(rawPrices[count]) || DEFAULT_DAILY_PRICES[count]);
  }

  return {
    mode,
    hasExplicitConfig,
    dailyStartTime: normalizeTime(raw.dailyStartTime, "10:00"),
    dailyEndTime: normalizeTime(raw.dailyEndTime, "13:00"),
    dailyCapacity: Math.max(1, Math.min(4, Number(raw.dailyCapacity) || 4)),
    maxBookingMonths: Math.max(1, Math.min(6, Number(raw.maxBookingMonths) || 6)),
    allowSharedBookings: raw.allowSharedBookings === true,
    attendeePrices,
  };
}

function createDailyClassSlots(workshop) {
  const slug = getWorkshopSlug(workshop);
  const config = getWorkshopBookingConfig(workshop);
  const startDate = addDays(new Date(), 1);
  const limitDate = addMonths(startDate, config.maxBookingMonths - 1);
  const slots = [];

  for (let date = startDate; date <= limitDate; date = addDays(date, 1)) {
    const isoDate = toIsoDate(date);
    slots.push({
      _key: createSlotKey(slug, isoDate, config.dailyStartTime),
      label: `${isoDate} ${config.dailyStartTime}`,
      date: isoDate,
      startTime: config.dailyStartTime,
      endTime: config.dailyEndTime,
      capacity: config.dailyCapacity,
      isBlocked: false,
      status: "open",
      reason: "",
    });
  }

  return slots;
}

function createUpcomingSlots(slug, {
  weekday = 6,
  weeks = 8,
  times = ["10:00", "14:00", "18:00"],
  capacity = 6,
  blockedWeekIndexes = [],
  blockedReasons = {},
} = {}) {
  const firstDate = findNextWeekday(new Date(), weekday);
  const slots = [];

  for (let weekIndex = 0; weekIndex < weeks; weekIndex += 1) {
    const targetDate = addDays(firstDate, weekIndex * 7);
    const isoDate = toIsoDate(targetDate);
    const isBlockedWeek = blockedWeekIndexes.includes(weekIndex);
    const weekdayLabel = WEEKDAY_LABELS[targetDate.getDay()] || "day";

    for (const time of times) {
      slots.push({
        _key: createSlotKey(slug, isoDate, time),
        label: `${isoDate} ${time}`,
        date: isoDate,
        startTime: time,
        endTime: "",
        capacity,
        isBlocked: isBlockedWeek,
        status: isBlockedWeek ? "blocked" : "open",
        reason: isBlockedWeek ? (blockedReasons[weekIndex] || `${weekdayLabel} unavailable`) : "",
      });
    }
  }

  return slots;
}

export function normalizeWorkshopCategory(value) {
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

export function slugifyWorkshopTitle(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function getWorkshopSlug(workshop) {
  const explicitSlug = String(workshop?.slug || workshop?.slug?.current || "").trim();
  if (explicitSlug) return explicitSlug;
  return slugifyWorkshopTitle(workshop?.title || workshop?._id || "workshop");
}

export function getWorkshopDescription(workshop) {
  const description = String(workshop?.description || workshop?.summary || workshop?.excerpt || "").replace(/\r\n/g, "\n").trim();
  if (!description) return "워크숍 설명이 곧 추가됩니다.";

  const sections = description.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  return sections.join("\n\n");
}

export function getWorkshopShortDescription(workshop) {
  const description = getWorkshopDescription(workshop);
  const parts = description.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  return parts[0] || description;
}

export function getWorkshopDuration(workshop) {
  return String(workshop?.durationLabel || workshop?.duration || "TBD").trim() || "TBD";
}

export function getWorkshopLevelLabel(workshop) {
  return String(workshop?.levelLabel || workshop?.audienceLabel || "all levels").trim() || "all levels";
}

export function getWorkshopPoster(workshop) {
  if (workshop?.poster?.asset?.url) return workshop.poster;
  if (workshop?.posterImage?.asset?.url) return workshop.posterImage;
  if (workshop?.mainImage?.asset?.url) return workshop.mainImage;
  if (Array.isArray(workshop?.images) && workshop.images[0]?.asset?.url) return workshop.images[0];
  return null;
}

export function getWorkshopMaterials(workshop) {
  if (Array.isArray(workshop?.materials)) {
    return workshop.materials.map((item) => String(item || "").trim()).filter(Boolean);
  }

  return [];
}

export function getWorkshopThingsToBring(workshop) {
  if (Array.isArray(workshop?.thingsToBring)) {
    return workshop.thingsToBring.map((item) => String(item || "").trim()).filter(Boolean);
  }

  return [];
}

export function getWorkshopPrice(workshop) {
  const price = Number(workshop?.price);
  return Number.isFinite(price) ? price : 0;
}

export function getWorkshopCapacity(workshop) {
  const capacity = Number(workshop?.maxCapacity || workshop?.capacityLabel || 0);
  return Number.isFinite(capacity) && capacity > 0 ? capacity : 6;
}

export function normalizeWorkshopSlot(slot, workshop) {
  const slug = getWorkshopSlug(workshop);
  const date = String(slot?.date || "").trim();
  const startTime = String(slot?.startTime || "").trim();
  const endTime = String(slot?.endTime || "").trim();
  const blocked = slot?.isBlocked === true || String(slot?.status || "").trim().toLowerCase() === "blocked";
  const capacity = Number(slot?.capacity);

  if (!date || !startTime) return null;

  return {
    key: String(slot?._key || createSlotKey(slug, date, startTime)).trim(),
    label: String(slot?.label || `${date} ${startTime}`).trim(),
    date,
    startTime,
    endTime,
    capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : getWorkshopCapacity(workshop),
    status: blocked ? "blocked" : "open",
    blockedReason: blocked ? String(slot?.reason || "예약 불가 일정입니다.").trim() : "",
  };
}

export function getWorkshopScheduleSlots(workshop) {
  const bookingConfig = getWorkshopBookingConfig(workshop);
  if (bookingConfig.hasExplicitConfig && bookingConfig.mode === "daily") {
    return createDailyClassSlots(workshop).map((slot) => normalizeWorkshopSlot(slot, workshop)).filter(Boolean);
  }

  const slots = Array.isArray(workshop?.scheduleSlots)
    ? workshop.scheduleSlots.map((slot) => normalizeWorkshopSlot(slot, workshop)).filter(Boolean)
    : [];

  if (slots.length > 0) {
    return slots.sort((left, right) => `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`));
  }

  if (bookingConfig.hasExplicitConfig) {
    return [];
  }

  return createDailyClassSlots(workshop).map((slot) => normalizeWorkshopSlot(slot, workshop)).filter(Boolean);
}

export function normalizeWorkshop(workshop = {}) {
  const category = normalizeWorkshopCategory(workshop?.category || workshop?.workshopCategory) || "beginning";

  return {
    ...workshop,
    slug: getWorkshopSlug(workshop),
    category,
    summary: getWorkshopShortDescription(workshop),
    description: getWorkshopDescription(workshop),
    durationLabel: getWorkshopDuration(workshop),
    levelLabel: getWorkshopLevelLabel(workshop),
    price: getWorkshopPrice(workshop),
    maxCapacity: getWorkshopCapacity(workshop),
    bookingConfig: getWorkshopBookingConfig(workshop),
    materials: getWorkshopMaterials(workshop),
    thingsToBring: getWorkshopThingsToBring(workshop),
    scheduleSlots: getWorkshopScheduleSlots(workshop),
  };
}