const WEEKDAY_LABELS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

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
  const slots = Array.isArray(workshop?.scheduleSlots)
    ? workshop.scheduleSlots.map((slot) => normalizeWorkshopSlot(slot, workshop)).filter(Boolean)
    : [];

  if (slots.length > 0) {
    return slots.sort((left, right) => `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`));
  }

  const slug = getWorkshopSlug(workshop);
  const category = normalizeWorkshopCategory(workshop?.category || workshop?.workshopCategory) || "repair";

  if (category === "for kids") {
    return createUpcomingSlots(slug, {
      weekday: 6,
      times: ["11:00", "14:00"],
      capacity: 4,
      blockedWeekIndexes: [1],
      blockedReasons: { 1: "weekend unavailable" },
    }).map((slot) => normalizeWorkshopSlot(slot, workshop)).filter(Boolean);
  }

  return createUpcomingSlots(slug, {
    weekday: category === "making" ? 5 : 6,
    times: ["10:00", "14:00", "18:00"],
    capacity: getWorkshopCapacity(workshop),
    blockedWeekIndexes: [2],
    blockedReasons: { 2: "personal schedule" },
  }).map((slot) => normalizeWorkshopSlot(slot, workshop)).filter(Boolean);
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
    materials: getWorkshopMaterials(workshop),
    thingsToBring: getWorkshopThingsToBring(workshop),
    scheduleSlots: getWorkshopScheduleSlots(workshop),
  };
}

export const FALLBACK_WORKSHOPS = [
  normalizeWorkshop({
    title: "Visible Mending",
    slug: "visible-mending",
    description: "구멍 난 옷을 관찰하고 실과 천으로 이어가는 시간입니다. 흔적을 남기는 수선 방식과 오알룸이 자주 사용하는 기본 스티치를 함께 익힙니다.\n\n직접 가져온 옷 한 벌을 중심으로 수선의 기준점을 잡고, 실습 후에도 혼자 이어갈 수 있도록 작은 가이드를 함께 드립니다.",
    durationLabel: "3 HOURS",
    category: "repair",
    levelLabel: "ALL LEVELS",
    locationName: "Studio OALUM",
    locationAddress: "서울특별시 성산동 252-3 2층 202호",
    maxCapacity: 6,
    materials: ["기본 수선 실과 바늘", "패치용 원단", "실습용 작은 키트"],
    thingsToBring: ["수선하고 싶은 옷 1벌", "필요하면 참고 이미지"],
    bookingNotice: "예약 확정 후 준비물과 입실 안내를 개별 메일로 드립니다.",
  }),
  normalizeWorkshop({
    title: "Begin with Yarn",
    slug: "begin-with-yarn",
    description: "천천히 실을 다루는 기본 손감각과 가장 쉬운 스티치부터 익히는 입문 워크숍입니다. 손이 느린 사람도 따라올 수 있게 속도를 맞춥니다.\n\n작은 샘플 스와치를 만들며 재료를 이해하고, 다음 단계 작업으로 이어질 수 있는 기본 감각을 익힙니다.",
    durationLabel: "2 HOURS",
    category: "beginning",
    levelLabel: "BEGINNER",
    locationName: "Studio OALUM",
    locationAddress: "서울특별시 성산동 252-3 2층 202호",
    maxCapacity: 8,
    materials: ["기본 실 세트", "입문용 바늘", "연습용 패브릭"],
    thingsToBring: ["편한 복장"],
    bookingNotice: "입문 클래스라 재료는 모두 제공됩니다.",
  }),
  normalizeWorkshop({
    title: "Soft Object Making",
    slug: "soft-object-making",
    description: "오알룸이 좋아하는 질감과 색 조합으로 작은 패브릭 오브제를 함께 만드는 메이킹 클래스입니다. 패턴을 단순하게 이해하고, 손으로 조립하는 리듬을 경험합니다.",
    durationLabel: "3.5 HOURS",
    category: "making",
    levelLabel: "ALL LEVELS",
    locationName: "Studio OALUM",
    locationAddress: "서울특별시 성산동 252-3 2층 202호",
    maxCapacity: 5,
    materials: ["겉감/안감 패브릭", "충전재", "기본 봉제 도구"],
    thingsToBring: ["작업 결과물을 담아갈 가벼운 가방"],
  }),
  normalizeWorkshop({
    title: "Tiny Hands Club",
    slug: "tiny-hands-club",
    description: "아이들이 실과 천을 안전하게 만지며 형태를 만드는 과정을 즐길 수 있도록 구성한 키즈 워크숍입니다. 보호자 1인 동반을 권장합니다.",
    durationLabel: "90 MIN",
    category: "for kids",
    levelLabel: "FOR KIDS",
    locationName: "Studio OALUM",
    locationAddress: "서울특별시 성산동 252-3 2층 202호",
    maxCapacity: 4,
    materials: ["안전 가위", "색실", "펠트 조각"],
    thingsToBring: ["아이용 물병"],
  }),
];

export function findFallbackWorkshopBySlug(slug) {
  const normalizedSlug = String(slug || "").trim();
  return FALLBACK_WORKSHOPS.find((workshop) => workshop.slug === normalizedSlug) || null;
}