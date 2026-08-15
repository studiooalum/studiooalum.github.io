const ADMIN_ACCESS_TOKEN_KEY = "studiooalum:order-admin-access-token";
const ADMIN_ACCESS_EXPIRES_AT_KEY = "studiooalum:order-admin-access-expires-at";
const DEFAULT_BOOKING_NOTICE = "예약일 3일 전까지 100% 환불 가능합니다. 이후 환불은 불가하며, 양도는 가능합니다.";
const ADMIN_MODES = ["workshops", "reservations", "groups", "blocked-dates"];

const dom = {
  authForm: document.querySelector(".js-workshop-admin-auth-form"),
  authClear: document.querySelector(".js-workshop-admin-auth-clear"),
  authStatus: document.querySelector(".js-workshop-admin-auth-status"),
  authGuards: Array.from(document.querySelectorAll("[data-workshop-admin-auth-guard]")),
  accessBadge: document.querySelector(".js-workshop-admin-access-badge"),
  accessCopy: document.querySelector(".js-workshop-admin-access-copy"),
  accessMeta: document.querySelector(".js-workshop-admin-access-meta"),
  modeButtons: Array.from(document.querySelectorAll(".js-workshop-admin-mode-btn")),
  modeCopy: document.querySelector(".js-workshop-admin-mode-copy"),
  modeSections: Array.from(document.querySelectorAll("[data-workshop-admin-mode]")),
  reservationWorkshopFilter: document.querySelector(".js-workshop-admin-reservation-workshop-filter"),
  searchInput: document.querySelector(".js-workshop-admin-search-input"),
  statusFilter: document.querySelector(".js-workshop-admin-status-filter"),
  searchButton: document.querySelector(".js-workshop-admin-search-btn"),
  refreshButton: document.querySelector(".js-workshop-admin-refresh-btn"),
  listStatus: document.querySelector(".js-workshop-admin-list-status"),
  reservationList: document.querySelector(".js-workshop-admin-reservation-list"),
  detail: document.querySelector(".js-workshop-admin-detail"),
  detailActions: document.querySelector(".js-workshop-admin-detail-actions"),
  detailStatus: document.querySelector(".js-workshop-admin-detail-status"),
  cancelButton: document.querySelector(".js-workshop-admin-cancel-btn"),
  restoreButton: document.querySelector(".js-workshop-admin-restore-btn"),
  refundButton: document.querySelector(".js-workshop-admin-refund-btn"),
  groupList: document.querySelector(".js-workshop-admin-group-list"),
  groupStatus: document.querySelector(".js-workshop-admin-group-status"),
  groupRefreshButton: document.querySelector(".js-workshop-admin-group-refresh-btn"),
  blockForm: document.querySelector(".js-workshop-admin-block-form"),
  blockStatus: document.querySelector(".js-workshop-admin-block-status"),
  blockList: document.querySelector(".js-workshop-admin-block-list"),
  contentList: document.querySelector(".js-workshop-admin-content-list"),
  contentListStatus: document.querySelector(".js-workshop-admin-content-list-status"),
  contentNewButton: document.querySelector(".js-workshop-admin-content-new-btn"),
  contentForm: document.querySelector(".js-workshop-admin-content-form"),
  contentStatus: document.querySelector(".js-workshop-admin-content-status"),
  saveDraftButton: document.querySelector(".js-workshop-admin-save-draft-btn"),
  previewButton: document.querySelector(".js-workshop-admin-preview-btn"),
  publishButton: document.querySelector(".js-workshop-admin-publish-btn"),
  archiveButton: document.querySelector(".js-workshop-admin-archive-btn"),
  categorySelect: document.querySelector(".js-workshop-admin-category-select"),
  categoryCustom: document.querySelector(".js-workshop-admin-category-custom"),
  durationSelect: document.querySelector(".js-workshop-admin-duration-select"),
  difficultySelect: document.querySelector(".js-workshop-admin-difficulty-select"),
  bookingModeSelect: document.querySelector(".js-workshop-admin-booking-mode"),
  dailyConfig: Array.from(document.querySelectorAll(".js-workshop-admin-daily-config")),
  scheduledConfig: Array.from(document.querySelectorAll(".js-workshop-admin-scheduled-config")),
  posterUploadInput: document.querySelector(".js-workshop-admin-poster-upload-input"),
  posterUploadButton: document.querySelector(".js-workshop-admin-poster-upload-btn"),
  posterDropzone: document.querySelector(".js-workshop-admin-poster-dropzone"),
  posterList: document.querySelector(".js-workshop-admin-poster-list"),
  galleryUploadInput: document.querySelector(".js-workshop-admin-gallery-upload-input"),
  galleryUploadButton: document.querySelector(".js-workshop-admin-gallery-upload-btn"),
  galleryDropzone: document.querySelector(".js-workshop-admin-gallery-dropzone"),
  galleryList: document.querySelector(".js-workshop-admin-gallery-list"),
  slotList: document.querySelector(".js-workshop-admin-slot-list"),
  slotAddButton: document.querySelector(".js-workshop-admin-slot-add-btn"),
};

const state = {
  accessToken: sessionStorage.getItem(ADMIN_ACCESS_TOKEN_KEY) || "",
  accessExpiresAt: sessionStorage.getItem(ADMIN_ACCESS_EXPIRES_AT_KEY) || "",
  isAuthorized: false,
  reservations: [],
  groups: [],
  blocks: [],
  workshops: [],
  contentItems: [],
  selectedReservationId: "",
  selectedContentSlug: "",
  reservationWorkshopFilter: "all",
  draggingGalleryIndex: null,
  uiMode: "workshops",
  isDirty: false,
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugifyText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function setStatus(target, message = "", type = "info") {
  if (!target) return;
  target.textContent = message;
  target.classList.remove("is-success", "is-error");
  if (type === "success") target.classList.add("is-success");
  if (type === "error") target.classList.add("is-error");
}

function setButtonLoading(button, loading, loadingText) {
  if (!button) return;
  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent || "";
  }
  button.disabled = loading;
  button.textContent = loading ? loadingText : button.dataset.defaultLabel;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(Math.max(0, Number(value) || 0));
}

function formatSessionRemaining(value) {
  if (!value) return "";
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) return "";
  const diffMs = expiresAt.getTime() - Date.now();
  if (diffMs <= 0) return "곧";
  const totalMinutes = Math.max(1, Math.ceil(diffMs / 60000));
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  }
  return `${totalMinutes}분`;
}

function persistAdminAccess(token, expiresAt = "") {
  state.accessToken = String(token || "").trim();
  state.accessExpiresAt = String(expiresAt || "").trim();
  if (state.accessToken) {
    sessionStorage.setItem(ADMIN_ACCESS_TOKEN_KEY, state.accessToken);
  } else {
    sessionStorage.removeItem(ADMIN_ACCESS_TOKEN_KEY);
  }
  if (state.accessExpiresAt) {
    sessionStorage.setItem(ADMIN_ACCESS_EXPIRES_AT_KEY, state.accessExpiresAt);
  } else {
    sessionStorage.removeItem(ADMIN_ACCESS_EXPIRES_AT_KEY);
  }
}

function clearAdminAccess() {
  persistAdminAccess("", "");
  state.isAuthorized = false;
}

function emptyWorkshopDraft(seed = {}) {
  return {
    id: "",
    slug: seed.slug || "",
    title: seed.title || "",
    category: seed.category || "",
    summary: seed.summary || "",
    description: seed.description || "",
    durationLabel: seed.durationLabel || "1시간",
    levelLabel: seed.levelLabel || "Beginner",
    audienceLabel: seed.audienceLabel || seed.levelLabel || "Beginner",
    maxCapacity: Number(seed.maxCapacity) || 4,
    capacityLabel: seed.capacityLabel || "",
    price: Number(seed.price) || 0,
    bookingConfig: seed.bookingConfig && typeof seed.bookingConfig === "object" ? seed.bookingConfig : {},
    bookingNotice: seed.bookingNotice || "",
    hostName: seed.hostName || "",
    locationName: seed.locationName || "",
    locationAddress: seed.locationAddress || "",
    locationDetail: seed.locationDetail || "",
    materials: Array.isArray(seed.materials) ? seed.materials : [],
    thingsToBring: Array.isArray(seed.thingsToBring) ? seed.thingsToBring : [],
    posterImageUrl: seed.posterImageUrl || "",
    posterImageR2Key: seed.posterImageR2Key || "",
    posterImageAlt: seed.posterImageAlt || "",
    galleryImages: Array.isArray(seed.galleryImages) ? seed.galleryImages : [],
    scheduleSlots: Array.isArray(seed.scheduleSlots) ? seed.scheduleSlots : [],
    status: seed.status || "draft",
    sortOrder: Number(seed.sortOrder) || 0,
    sourceMode: seed.sourceMode || "d1-r2-ready",
    publishedAt: seed.publishedAt || "",
  };
}

function getCategoryValue() {
  const preset = String(dom.categorySelect?.value || "").trim();
  if (preset && preset !== "custom") {
    return preset;
  }
  return String(dom.categoryCustom?.value || "").trim();
}

function setCategoryValue(value) {
  const normalized = String(value || "").trim();
  const options = Array.from(dom.categorySelect?.options || []).map((option) => option.value);
  const matched = !normalized ? "" : (options.includes(normalized) ? normalized : "custom");

  if (dom.categorySelect) {
    dom.categorySelect.value = matched;
  }
  if (dom.categoryCustom) {
    dom.categoryCustom.hidden = matched !== "custom";
    dom.categoryCustom.value = matched === "custom" ? normalized : "";
  }
}

function syncCategoryField() {
  if (!dom.categorySelect || !dom.categoryCustom) return;
  dom.categoryCustom.hidden = dom.categorySelect.value !== "custom";
  if (dom.categorySelect.value !== "custom") {
    dom.categoryCustom.value = "";
  }
}

function ensureSelectOption(select, value) {
  if (!select || !value) return;
  const hasValue = Array.from(select.options).some((option) => option.value === value);
  if (!hasValue) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
}

function getDifficultyValue(workshop) {
  return String(workshop?.levelLabel || workshop?.audienceLabel || "Beginner").trim() || "Beginner";
}

function getWorkshopStatusLabel(value) {
  const normalized = String(value || "draft").trim().toLowerCase();
  if (normalized === "published") return "게시됨";
  if (normalized === "archived") return "보관됨";
  return "초안";
}

function normalizeWorkshopType(value, fallback = "event") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["daily", "one_day_open"].includes(normalized)) return "daily";
  if (["event", "one_day_fixed"].includes(normalized)) return "event";
  if (["multisession", "multi_session"].includes(normalized)) return "multiSession";
  return fallback;
}

function getBookingConfig(workshop = {}) {
  const raw = workshop.bookingConfig && typeof workshop.bookingConfig === "object" ? workshop.bookingConfig : {};
  const hasScheduledSlots = Array.isArray(workshop.scheduleSlots) && workshop.scheduleSlots.length > 0;
  const type = normalizeWorkshopType(
    raw.workshopType || raw.type,
    raw.mode === "daily" || !hasScheduledSlots ? "daily" : "event",
  );
  const prices = raw.priceTiers && typeof raw.priceTiers === "object"
    ? raw.priceTiers
    : raw.attendeePrices && typeof raw.attendeePrices === "object"
      ? raw.attendeePrices
      : {};
  const maxParticipants = Math.max(1, Number(raw.maxParticipants || raw.dailyCapacity || workshop.maxCapacity) || 4);
  return {
    workshopType: type,
    mode: type === "daily" ? "daily" : "scheduled",
    dailyStartTime: /^\d{2}:\d{2}$/.test(String(raw.dailyStartTime || "")) ? raw.dailyStartTime : "10:00",
    dailyEndTime: /^\d{2}:\d{2}$/.test(String(raw.dailyEndTime || "")) ? raw.dailyEndTime : "13:00",
    dailyCapacity: Math.max(1, Math.min(4, Number(raw.dailyCapacity) || maxParticipants)),
    maxBookingMonths: Math.max(1, Math.min(6, Number(raw.maxBookingMonths) || 6)),
    attendeePrices: {
      1: Math.max(0, Number(prices[1]) || 120000),
      2: Math.max(0, Number(prices[2]) || 200000),
      3: Math.max(0, Number(prices[3]) || 270000),
      4: Math.max(0, Number(prices[4]) || 300000),
    },
    priceTiers: {
      1: Math.max(0, Number(prices[1]) || 120000),
      2: Math.max(0, Number(prices[2]) || 200000),
      3: Math.max(0, Number(prices[3]) || 270000),
      4: Math.max(0, Number(prices[4]) || 300000),
    },
    fixedPrice: Math.max(0, Number(raw.fixedPrice) || Number(workshop.price) || 0),
    minParticipants: Math.min(maxParticipants, Math.max(1, Number(raw.minParticipants) || 1)),
    maxParticipants,
    paymentDeadlineHours: Math.max(1, Number(raw.paymentDeadlineHours) || 48),
  };
}

function applyBookingModeUi(type = "event") {
  const isDaily = normalizeWorkshopType(type) === "daily";
  for (const element of dom.dailyConfig) element.hidden = !isDaily;
  for (const element of dom.scheduledConfig) element.hidden = isDaily;
}

function setDirtyState(isDirty) {
  state.isDirty = Boolean(isDirty);
}

function isWorkshopEditorDirty() {
  return Boolean(state.isDirty);
}

function confirmDiscardUnsavedChanges() {
  if (!isWorkshopEditorDirty()) return true;
  return window.confirm("저장하지 않은 변경사항이 있습니다. 계속하면 편집 내용이 사라질 수 있습니다. 계속할까요?");
}

function syncDirtyIndicator() {
  if (dom.contentStatus && isWorkshopEditorDirty()) {
    const current = dom.contentStatus.textContent.trim();
    if (!current.includes("저장되지 않은 변경사항")) {
      dom.contentStatus.textContent = current ? `${current} · 저장되지 않은 변경사항이 있습니다.` : "저장되지 않은 변경사항이 있습니다.";
    }
  }
}

function focusWorkshopField(field, message) {
  const target = typeof field === "string" ? dom.contentForm?.elements[field] : field;
  const section = target?.closest("details");
  if (section) section.open = true;
  setStatus(dom.contentStatus, message, "error");
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
  target?.focus({ preventScroll: true });
}

async function previewSelectedWorkshop() {
  const current = getSelectedContentItem();
  const status = current?.status === "published" ? "published" : "draft";
  const result = await saveWorkshopContent(status, dom.previewButton);
  if (!result) return;

  const workshop = getSelectedContentItem();
  if (!workshop?.slug) {
    setStatus(dom.contentStatus, "미리보기할 워크숍의 slug를 확인해주세요.", "error");
    return;
  }

  window.open(`./workshop?slug=${encodeURIComponent(workshop.slug)}&preview=1`, "_blank", "noopener,noreferrer");
}

function getVisibleReservations() {
  if (state.reservationWorkshopFilter === "all") return state.reservations;
  return state.reservations.filter((reservation) => reservation.workshopSlug === state.reservationWorkshopFilter);
}

function syncSelectedReservation() {
  const visibleReservations = getVisibleReservations();
  const exists = visibleReservations.some((reservation) => reservation.reservationId === state.selectedReservationId);
  if (!exists) {
    state.selectedReservationId = visibleReservations[0]?.reservationId || "";
  }
}

function syncSelectedContent() {
  const exists = state.contentItems.some((item) => item.slug === state.selectedContentSlug);
  if (!exists) {
    state.selectedContentSlug = state.contentItems[0]?.slug || "";
  }
}

function getSelectedReservation() {
  return getVisibleReservations().find((reservation) => reservation.reservationId === state.selectedReservationId) || null;
}

function getSelectedContentItem() {
  return state.contentItems.find((item) => item.slug === state.selectedContentSlug) || null;
}

function applySnapshotPayload(payload) {
  state.reservations = Array.isArray(payload?.reservations) ? payload.reservations : [];
  state.groups = Array.isArray(payload?.groups) ? payload.groups : [];
  state.blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
  state.workshops = Array.isArray(payload?.workshops) ? payload.workshops : [];
  state.contentItems = Array.isArray(payload?.contentItems) ? payload.contentItems : [];

  syncSelectedReservation();
  syncSelectedContent();
}

function applyAccessState() {
  const unlocked = Boolean(state.isAuthorized && state.accessToken);
  dom.authGuards.forEach((element) => {
    element.hidden = !unlocked;
  });

  if (dom.accessBadge) {
    dom.accessBadge.textContent = unlocked ? "세션 활성" : "잠금 상태";
    dom.accessBadge.classList.toggle("is-success", unlocked);
  }

  if (dom.accessCopy) {
    dom.accessCopy.textContent = unlocked
      ? "워크숍별 신청자와 예약 상태를 관리할 수 있습니다. 브라우저에는 짧은 관리자 세션만 유지합니다."
      : "관리자 인증 전에는 예약 데이터와 차단 일정이 로드되지 않습니다.";
  }

  if (dom.accessMeta) {
    dom.accessMeta.textContent = unlocked
      ? `세션 만료 예정: ${formatDate(state.accessExpiresAt)} · 약 ${formatSessionRemaining(state.accessExpiresAt)} 후 다시 인증됩니다.`
      : "ORDER_ADMIN_SECRET 원문은 브라우저에 저장하지 않습니다.";
  }

  applyUiMode();
}

function applyUiMode() {
  const mode = ADMIN_MODES.includes(state.uiMode) ? state.uiMode : "workshops";
  const unlocked = Boolean(state.isAuthorized && state.accessToken);

  for (const section of dom.modeSections || []) {
    const sectionMode = String(section.dataset.workshopAdminMode || "").trim();
    section.hidden = !unlocked || sectionMode !== mode;
  }

  for (const button of dom.modeButtons || []) {
    const isActive = String(button.dataset.mode || "").trim() === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  }

  if (dom.modeCopy) {
    dom.modeCopy.textContent = mode === "workshops"
      ? "워크숍 신규 등록, 포스터/상세 이미지 업로드, 세션 편집을 관리합니다."
      : mode === "reservations"
        ? "예약 조회/취소와 신청자 정보를 관리합니다."
        : mode === "groups"
          ? "날짜 신청형 워크숍의 그룹 모집과 결제 요청을 관리합니다."
        : "전역 날짜 차단과 해제를 관리합니다.";
  }
}

function getUiModeFromHash() {
  const mode = String(window.location.hash || "").replace(/^#/, "").trim();
  return ADMIN_MODES.includes(mode) ? mode : "workshops";
}

function syncUiModeHash(mode, { replace = false } = {}) {
  const hash = `#${mode}`;
  if (window.location.hash === hash) return;

  const url = `${window.location.pathname}${window.location.search}${hash}`;
  if (replace) {
    window.history.replaceState(null, "", url);
  } else {
    window.history.pushState(null, "", url);
  }
}

function setUiMode(mode, { syncHash = true } = {}) {
  state.uiMode = ADMIN_MODES.includes(mode) ? mode : "workshops";
  applyUiMode();
  if (syncHash) syncUiModeHash(state.uiMode);
}

function getAuthHeaders(includeJson = false) {
  const headers = { Accept: "application/json" };
  if (state.accessToken) {
    headers.Authorization = `Bearer ${state.accessToken}`;
  }
  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function requestAdmin(url, { method = "GET", body } = {}) {
  const headers = getAuthHeaders(false);
  let requestBody = body;

  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: requestBody,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    const error = new Error(payload?.error || `Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function createAdminSession(secret) {
  const response = await fetch("/api/orders/admin-session", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ adminSecret: secret }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    const error = new Error(payload?.error || `Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function verifyAdminSession() {
  return requestAdmin("/api/orders/admin-session");
}

function buildWorkshopOptionSources() {
  const map = new Map();
  for (const workshop of state.workshops) {
    const slug = String(workshop.slug || "").trim();
    if (!slug) continue;
    map.set(slug, workshop.title || slug);
  }
  for (const item of state.contentItems) {
    const slug = String(item.slug || "").trim();
    if (!slug) continue;
    if (!map.has(slug)) {
      map.set(slug, item.title || slug);
    }
  }
  return Array.from(map.entries()).map(([slug, title]) => ({ slug, title }));
}

function renderWorkshopOptions() {
  const options = buildWorkshopOptionSources();

  if (dom.reservationWorkshopFilter) {
    const previous = state.reservationWorkshopFilter;
    dom.reservationWorkshopFilter.innerHTML = '<option value="all">전체</option>';
    for (const item of options) {
      const option = document.createElement("option");
      option.value = item.slug;
      option.textContent = item.title;
      dom.reservationWorkshopFilter.appendChild(option);
    }

    const hasPrevious = previous === "all" || options.some((item) => item.slug === previous);
    state.reservationWorkshopFilter = hasPrevious ? previous : "all";
    dom.reservationWorkshopFilter.value = state.reservationWorkshopFilter;
  }

}

function renderReservations() {
  if (!dom.reservationList) return;
  const reservations = getVisibleReservations();

  if (!reservations.length) {
    dom.reservationList.innerHTML = '<div class="fulfillment-empty">조회된 워크숍 예약이 없습니다.</div>';
    return;
  }

  dom.reservationList.innerHTML = reservations.map((reservation) => {
    const activeClass = reservation.reservationId === state.selectedReservationId ? " is-active" : "";
    return `
      <button type="button" class="fulfillment-order-card${activeClass}" data-reservation-id="${escapeHtml(reservation.reservationId)}">
        <div class="fulfillment-order-card__top">
          <strong>${escapeHtml(reservation.workshopTitle || reservation.workshopSlug || "워크숍")}</strong>
          <span>${escapeHtml(reservation.statusLabel || reservation.status || "확정")}</span>
        </div>
        <p class="fulfillment-order-card__meta">${escapeHtml(reservation.fullName || "예약자")} · ${escapeHtml(reservation.email || "")}</p>
        <p class="fulfillment-order-card__meta">${escapeHtml(reservation.slotDate || "")} · ${escapeHtml([reservation.slotStartTime, reservation.slotEndTime].filter(Boolean).join(" - ") || reservation.slotLabel || "")}</p>
      </button>
    `;
  }).join("");
}

function renderGroups() {
  if (!dom.groupList) return;

  if (!state.groups.length) {
    dom.groupList.innerHTML = '<div class="fulfillment-empty">현재 모집 중이거나 최근 종료된 그룹이 없습니다.</div>';
    return;
  }

  dom.groupList.innerHTML = state.groups.map((group) => {
    const canFinalize = group.status === "open";
    const canSendPayment = group.status === "finalized" && Number(group.paymentDueParticipants || 0) > 0;
    const canCancel = group.status === "open" || group.status === "finalized";
    return `
      <article class="fulfillment-order-card">
        <div class="fulfillment-order-card__top">
          <strong>${escapeHtml(group.workshopTitle || group.workshopSlug || "워크숍")}</strong>
          <span>${escapeHtml(group.statusLabel || group.status || "모집 중")}</span>
        </div>
        <p class="fulfillment-order-card__meta">${escapeHtml(group.requestedDate || "날짜 미정")} · ${escapeHtml(group.groupMode === "private" ? "우리 팀" : "공개 모집")}</p>
        <p class="fulfillment-order-card__meta">${escapeHtml(group.currentParticipants || 0)} / ${escapeHtml(group.maxParticipants || 0)}명 · 결제 완료 ${escapeHtml(group.paidParticipants || 0)}명</p>
        <p class="fulfillment-order-card__meta">${group.finalAmount > 0 ? `최종 그룹 총액 ${escapeHtml(formatCurrency(group.finalAmount))}` : "최종 금액 미확정"}${group.paymentDeadlineAt ? ` · 결제 기한 ${escapeHtml(formatDate(group.paymentDeadlineAt))}` : ""}</p>
        <div class="fulfillment-actions">
          ${canFinalize ? `<button type="button" class="fulfillment-btn" data-group-action="finalize" data-group-id="${escapeHtml(group.groupId)}">그룹 마감</button>` : ""}
          ${canSendPayment ? `<button type="button" class="fulfillment-btn fulfillment-btn--secondary" data-group-action="send-payment" data-group-id="${escapeHtml(group.groupId)}">결제 요청</button>` : ""}
          ${canCancel ? `<button type="button" class="fulfillment-btn fulfillment-btn--secondary" data-group-action="cancel" data-group-id="${escapeHtml(group.groupId)}">그룹 취소</button>` : ""}
        </div>
      </article>
    `;
  }).join("");
}

function renderBlocks() {
  if (!dom.blockList) return;
  if (!state.blocks.length) {
    dom.blockList.innerHTML = '<div class="fulfillment-empty">현재 등록된 차단 일정이 없습니다.</div>';
    return;
  }

  dom.blockList.innerHTML = state.blocks.map((block) => `
    <div class="fulfillment-block-item">
      <div>
        <strong>${escapeHtml(block.isGlobal ? "전역 일정 차단" : (block.workshopTitle || block.workshopSlug || "워크숍 일정 차단"))}</strong>
        <p class="fulfillment-copy">${escapeHtml(block.slotDate)} · ${escapeHtml(block.reason || "예약 불가 일정입니다.")}</p>
      </div>
      <button type="button" class="fulfillment-btn fulfillment-btn--secondary" data-block-id="${escapeHtml(block.id)}">해제</button>
    </div>
  `).join("");
}

function renderDetail() {
  const reservation = getSelectedReservation();

  if (!reservation) {
    dom.detail.innerHTML = '<div class="fulfillment-empty">왼쪽 목록에서 예약을 선택하세요.</div>';
    if (dom.detailActions) dom.detailActions.hidden = true;
    return;
  }

  dom.detail.innerHTML = `
    <div class="fulfillment-summary">
      <div>
        <p class="fulfillment-summary__kicker">워크숍</p>
        <strong>${escapeHtml(reservation.workshopTitle || reservation.workshopSlug || "워크숍")}</strong>
      </div>
      <div>
        <p class="fulfillment-summary__kicker">상태</p>
        <strong>${escapeHtml(reservation.statusLabel || reservation.status || "확정")}</strong>
      </div>
      <div>
        <p class="fulfillment-summary__kicker">예약일</p>
        <strong>${escapeHtml(reservation.slotDate || "")}</strong>
      </div>
      <div>
        <p class="fulfillment-summary__kicker">시간</p>
        <strong>${escapeHtml([reservation.slotStartTime, reservation.slotEndTime].filter(Boolean).join(" - ") || reservation.slotLabel || "")}</strong>
      </div>
    </div>
    <div class="fulfillment-order-meta">
      <p>${escapeHtml(reservation.fullName || "")}${reservation.email ? ` · ${escapeHtml(reservation.email)}` : ""}</p>
      <p>${escapeHtml(reservation.phone || "")}</p>
      <p>${escapeHtml(reservation.workshopLocation || "Studio OALUM")}</p>
      <p>${escapeHtml(reservation.attendeeCount || 1)}명 예약</p>
      <p>예약 유형 · ${escapeHtml(reservation.bookingType || "event")}</p>
      <p>결제 상태 · ${escapeHtml(reservation.paymentStatus || "not_required")}${reservation.amountDue > 0 ? ` · 결제 예정 ${escapeHtml(formatCurrency(reservation.amountDue))}` : ""}</p>
      ${reservation.note ? `<p class="fulfillment-copy fulfillment-copy--quiet">메모 · ${escapeHtml(reservation.note)}</p>` : ""}
      <p class="fulfillment-copy fulfillment-copy--quiet">생성 시각 · ${escapeHtml(formatDate(reservation.createdAt))}</p>
    </div>
  `;

  if (dom.detailActions) {
    dom.detailActions.hidden = false;
  }

  if (dom.cancelButton) {
    dom.cancelButton.hidden = reservation.status === "cancelled";
  }
  if (dom.restoreButton) {
    dom.restoreButton.hidden = reservation.status !== "cancelled";
  }
  if (dom.refundButton) {
    dom.refundButton.hidden = reservation.paymentStatus !== "paid";
  }
}

function renderContentList() {
  if (!dom.contentList) return;

  if (!state.contentItems.length) {
    dom.contentList.innerHTML = '<div class="fulfillment-empty">저장된 워크숍이 아직 없습니다.</div>';
    return;
  }

  dom.contentList.innerHTML = state.contentItems.map((item) => {
    const activeClass = item.slug === state.selectedContentSlug ? " is-active" : "";
    const statusText = getWorkshopStatusLabel(item.status);
    const summary = item.summary || item.description || "설명이 아직 없습니다.";
    return `
      <button type="button" class="workshop-admin-content-card${activeClass}" data-content-slug="${escapeHtml(item.slug)}">
        <div class="workshop-admin-content-head">
          <strong>${escapeHtml(item.title || item.slug)}</strong>
          <span class="workshop-admin-content-meta">${escapeHtml(statusText)}</span>
        </div>
        <p class="workshop-admin-content-meta">${escapeHtml(item.slug)}</p>
        <p class="fulfillment-copy">${escapeHtml(summary)}</p>
      </button>
    `;
  }).join("");
}

function composePosterImagesFromWorkshop(workshop) {
  const results = [];
  const posterUrl = String(workshop.posterImageUrl || "").trim();
  const posterKey = String(workshop.posterImageR2Key || "").trim();
  const posterCaption = String(workshop.posterImageAlt || "").trim();

  if (posterUrl || posterKey) {
    results.push({
      url: posterUrl,
      r2Key: posterKey,
      caption: posterCaption,
      kind: "poster",
    });
  }

  const gallery = Array.isArray(workshop.galleryImages) ? workshop.galleryImages : [];
  for (const item of gallery) {
    if (String(item?.kind || "").trim() !== "poster") continue;
    const url = String(item?.url || "").trim();
    const r2Key = String(item?.r2Key || "").trim();
    if (!url && !r2Key) continue;
    if (results.some((image) => image.url === url && image.r2Key === r2Key)) continue;
    results.push({
      url,
      r2Key,
      caption: String(item?.caption || item?.alt || "").trim(),
      kind: "poster",
    });
  }

  return results;
}

function composeGalleryImagesFromWorkshop(workshop) {
  const results = [];
  const gallery = Array.isArray(workshop.galleryImages) ? workshop.galleryImages : [];
  for (const item of gallery) {
    if (String(item?.kind || "").trim() === "poster") continue;
    const url = String(item?.url || "").trim();
    const r2Key = String(item?.r2Key || "").trim();
    if (!url && !r2Key) continue;
    results.push({
      url,
      r2Key,
      caption: String(item?.caption || item?.alt || "").trim(),
      kind: "gallery",
    });
  }

  return results;
}

function renderPosterRows(items = []) {
  if (!dom.posterList) return;

  const poster = items[0] || null;

  if (!poster) {
    dom.posterList.innerHTML = '<div class="fulfillment-empty">등록된 포스터가 없습니다.</div>';
    return;
  }

  dom.posterList.innerHTML = `
    <div class="workshop-admin-thumb-card js-workshop-admin-poster-item">
      <input type="hidden" name="posterUrl" value="${escapeHtml(poster.url || "")}">
      <input type="hidden" name="posterR2Key" value="${escapeHtml(poster.r2Key || "")}">
      <div class="workshop-admin-thumb-card__media">
        ${(poster.url || "").trim() ? `<img class="workshop-admin-image-preview" src="${escapeHtml(poster.url)}" alt="">` : ""}
      </div>
      <div class="workshop-admin-thumb-card__body">
        <strong>대표 포스터</strong>
        <label class="fulfillment-field">
          <span>대체 텍스트</span>
          <input type="text" name="posterCaption" value="${escapeHtml(poster.caption || "")}" maxlength="300" placeholder="포스터 설명">
        </label>
        <div class="workshop-admin-thumb-card__actions">
          <button type="button" class="fulfillment-btn fulfillment-btn--secondary" data-poster-remove="0">삭제</button>
        </div>
      </div>
    </div>
  `;
}

function renderGalleryRows(items = []) {
  if (!dom.galleryList) return;

  if (!items.length) {
    dom.galleryList.innerHTML = '<div class="fulfillment-empty">등록된 상세 이미지가 없습니다.</div>';
    return;
  }

  dom.galleryList.innerHTML = items.map((item, index) => `
    <div class="workshop-admin-thumb-card workshop-admin-thumb-card--gallery js-workshop-admin-gallery-item" data-gallery-index="${index}" draggable="true">
      <input type="hidden" name="galleryUrl" value="${escapeHtml(item.url || "")}">
      <input type="hidden" name="galleryR2Key" value="${escapeHtml(item.r2Key || "")}">
      <div class="workshop-admin-thumb-card__media">
        ${(item.url || "").trim() ? `<img class="workshop-admin-image-preview" src="${escapeHtml(item.url)}" alt="">` : ""}
      </div>
      <div class="workshop-admin-thumb-card__body">
        <strong>상세 이미지 ${index + 1}</strong>
        <label class="fulfillment-field">
          <span>캡션</span>
          <input type="text" name="galleryCaption" value="${escapeHtml(item.caption || "")}" maxlength="300" placeholder="이미지 설명">
        </label>
        <div class="workshop-admin-thumb-card__actions">
          <button type="button" class="fulfillment-btn fulfillment-btn--secondary" data-gallery-remove="${index}">삭제</button>
        </div>
      </div>
    </div>
  `).join("");
}

function renderSlotRows(items = []) {
  if (!dom.slotList) return;
  const rows = items.length ? items : [{}];

  dom.slotList.innerHTML = rows.map((item, index) => `
    <div class="workshop-admin-thumb-card workshop-admin-thumb-card--slot js-workshop-admin-slot-item" data-slot-index="${index}">
      <input type="hidden" name="slotKey" value="${escapeHtml(item._key || item.key || "")}">
      <div class="workshop-admin-thumb-card__body workshop-admin-thumb-card__body--stacked">
        <div class="workshop-admin-repeater-head">
          <strong>세션 ${index + 1}</strong>
          <div class="workshop-admin-repeater-head__actions">
            <button type="button" class="fulfillment-btn fulfillment-btn--secondary" data-slot-duplicate="${index}">복제</button>
            <button type="button" class="fulfillment-btn fulfillment-btn--secondary" data-slot-remove="${index}">삭제</button>
          </div>
        </div>
        <div class="workshop-admin-repeater-grid workshop-admin-repeater-grid--wide">
        <label class="fulfillment-field">
          <span>날짜</span>
          <input type="date" name="slotDate" value="${escapeHtml(item.date || "")}">
        </label>
        <label class="fulfillment-field">
          <span>시작 시간</span>
          <input type="time" name="slotStartTime" value="${escapeHtml(item.startTime || "")}">
        </label>
        <label class="fulfillment-field">
          <span>종료 시간</span>
          <input type="time" name="slotEndTime" value="${escapeHtml(item.endTime || "")}">
        </label>
        <label class="fulfillment-field">
          <span>정원</span>
          <input type="number" name="slotCapacity" min="1" step="1" value="${escapeHtml(item.capacity || 1)}">
        </label>
        <label class="fulfillment-field">
          <span>Session status</span>
          <select name="slotStatus">
            <option value="open" ${!item.isBlocked && item.status !== "blocked" ? "selected" : ""}>정상</option>
            <option value="blocked" ${item.isBlocked || item.status === "blocked" ? "selected" : ""}>차단</option>
          </select>
        </label>
        </div>
      </div>
    </div>
  `).join("");
}

function resetContentForm(seed = {}) {
  if (!dom.contentForm) return;
  const workshop = emptyWorkshopDraft(seed);

  dom.contentForm.elements.id.value = workshop.id;
  dom.contentForm.elements.publishedAt.value = workshop.publishedAt || "";
  dom.contentForm.elements.title.value = workshop.title;
  dom.contentForm.elements.slug.value = workshop.slug;
  dom.contentForm.elements.sortOrder.value = String(workshop.sortOrder || 0);
  dom.contentForm.elements.price.value = String(workshop.price || 0);
  dom.contentForm.elements.maxCapacity.value = String(workshop.maxCapacity || 0);
  dom.contentForm.elements.summary.value = workshop.summary;
  dom.contentForm.elements.description.value = workshop.description;
  dom.contentForm.elements.hostName.value = workshop.hostName;
  dom.contentForm.elements.locationName.value = workshop.locationName;
  dom.contentForm.elements.locationAddress.value = workshop.locationAddress;
  dom.contentForm.elements.locationDetail.value = workshop.locationDetail;
  dom.contentForm.elements.bookingNotice.value = workshop.bookingNotice || DEFAULT_BOOKING_NOTICE;
  dom.contentForm.elements.materials.value = workshop.materials.join("\n");
  dom.contentForm.elements.thingsToBring.value = workshop.thingsToBring.join("\n");
  dom.contentForm.elements.sourceMode.value = workshop.sourceMode || "d1-r2-ready";

  const bookingConfig = getBookingConfig(workshop);
  dom.bookingModeSelect.value = bookingConfig.workshopType;
  dom.contentForm.elements.dailyStartTime.value = bookingConfig.dailyStartTime;
  dom.contentForm.elements.dailyEndTime.value = bookingConfig.dailyEndTime;
  dom.contentForm.elements.dailyCapacity.value = String(bookingConfig.dailyCapacity);
  dom.contentForm.elements.maxBookingMonths.value = String(bookingConfig.maxBookingMonths);
  dom.contentForm.elements.priceOne.value = String(bookingConfig.attendeePrices[1]);
  dom.contentForm.elements.priceTwo.value = String(bookingConfig.attendeePrices[2]);
  dom.contentForm.elements.priceThree.value = String(bookingConfig.attendeePrices[3]);
  dom.contentForm.elements.priceFour.value = String(bookingConfig.attendeePrices[4]);
  dom.contentForm.elements.fixedPrice.value = String(bookingConfig.fixedPrice);
  dom.contentForm.elements.minParticipants.value = String(bookingConfig.minParticipants);
  dom.contentForm.elements.maxParticipants.value = String(bookingConfig.maxParticipants);
  dom.contentForm.elements.paymentDeadlineHours.value = String(bookingConfig.paymentDeadlineHours);
  applyBookingModeUi(bookingConfig.workshopType);

  setCategoryValue(workshop.category);

  ensureSelectOption(dom.durationSelect, workshop.durationLabel);
  dom.durationSelect.value = workshop.durationLabel || "1시간";

  const difficulty = getDifficultyValue(workshop);
  ensureSelectOption(dom.difficultySelect, difficulty);
  dom.difficultySelect.value = difficulty;

  const posterImages = composePosterImagesFromWorkshop(workshop);
  const galleryImages = composeGalleryImagesFromWorkshop(workshop);
  const slotItems = Array.isArray(workshop.scheduleSlots) ? workshop.scheduleSlots : [];

  renderPosterRows(posterImages);
  renderGalleryRows(galleryImages);
  renderSlotRows(slotItems);
  setDirtyState(false);
  setStatus(dom.contentStatus, workshop.slug ? `${workshop.slug} 편집 중입니다.` : "새 워크숍 초안을 작성 중입니다.");
}

function readLines(value) {
  return String(value || "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function collectPosterItems() {
  return Array.from(dom.posterList?.querySelectorAll(".js-workshop-admin-poster-item") || []).map((row) => ({
    url: String(row.querySelector('[name="posterUrl"]')?.value || "").trim(),
    r2Key: String(row.querySelector('[name="posterR2Key"]')?.value || "").trim(),
    caption: String(row.querySelector('[name="posterCaption"]')?.value || "").trim(),
    kind: "poster",
  })).filter((item) => item.url || item.r2Key);
}

function collectGalleryItems() {
  return Array.from(dom.galleryList?.querySelectorAll(".js-workshop-admin-gallery-item") || []).map((row) => ({
    url: String(row.querySelector('[name="galleryUrl"]')?.value || "").trim(),
    r2Key: String(row.querySelector('[name="galleryR2Key"]')?.value || "").trim(),
    caption: String(row.querySelector('[name="galleryCaption"]')?.value || "").trim(),
    kind: "gallery",
  })).filter((item) => item.url || item.r2Key);
}

function collectSlotItems() {
  const defaultCapacity = Math.max(1, Number(dom.contentForm?.elements.maxCapacity?.value || 1));

  return Array.from(dom.slotList?.querySelectorAll(".js-workshop-admin-slot-item") || []).map((row) => ({
    _key: String(row.querySelector('[name="slotKey"]')?.value || "").trim(),
    date: String(row.querySelector('[name="slotDate"]')?.value || "").trim(),
    startTime: String(row.querySelector('[name="slotStartTime"]')?.value || "").trim(),
    endTime: String(row.querySelector('[name="slotEndTime"]')?.value || "").trim(),
    capacity: Number(row.querySelector('[name="slotCapacity"]')?.value || defaultCapacity) || defaultCapacity,
    isBlocked: String(row.querySelector('[name="slotStatus"]')?.value || "open") === "blocked",
    status: String(row.querySelector('[name="slotStatus"]')?.value || "open") === "blocked" ? "blocked" : "open",
    reason: "",
  })).filter((item) => item.date && item.startTime);
}

function collectWorkshopPayload(statusOverride) {
  const current = getSelectedContentItem();
  const form = dom.contentForm;

  const title = String(form.elements.title.value || "").trim();
  const slug = String(form.elements.slug.value || "").trim() || slugifyText(title);
  if (!form.elements.slug.value && slug) {
    form.elements.slug.value = slug;
  }
  const difficulty = String(dom.difficultySelect?.value || "Beginner").trim() || "Beginner";
  const maxCapacity = Math.max(0, Number(form.elements.maxCapacity.value || 0));
  const posterImages = collectPosterItems();
  const galleryItems = collectGalleryItems();
  const primaryImage = posterImages[0] || { url: "", r2Key: "", caption: "" };
  const galleryImages = galleryItems.map((item) => ({
    url: item.url,
    r2Key: item.r2Key,
    alt: item.caption,
    caption: item.caption,
    kind: "gallery",
  }));

  const scheduleSlots = collectSlotItems();
  const workshopType = normalizeWorkshopType(dom.bookingModeSelect?.value);
  const bookingMode = workshopType === "daily" ? "daily" : "scheduled";
  const attendeePrices = {
    1: Math.max(0, Number(form.elements.priceOne.value || 120000)),
    2: Math.max(0, Number(form.elements.priceTwo.value || 200000)),
    3: Math.max(0, Number(form.elements.priceThree.value || 270000)),
    4: Math.max(0, Number(form.elements.priceFour.value || 300000)),
  };
  const dailyCapacity = Math.max(1, Math.min(4, Number(form.elements.dailyCapacity.value || 4)));
  const maxParticipants = Math.max(1, Number(form.elements.maxParticipants.value || 4));
  const minParticipants = Math.min(maxParticipants, Math.max(1, Number(form.elements.minParticipants.value || 1)));
  const fixedPrice = Math.max(0, Number(form.elements.fixedPrice.value || 0));
  const bookingConfig = {
    workshopType,
    mode: bookingMode,
    dailyStartTime: String(form.elements.dailyStartTime.value || "10:00").trim(),
    dailyEndTime: String(form.elements.dailyEndTime.value || "13:00").trim(),
    dailyCapacity,
    maxBookingMonths: Math.max(1, Math.min(6, Number(form.elements.maxBookingMonths.value || 6))),
    attendeePrices,
    fixedPrice,
    minParticipants,
    maxParticipants,
    paymentDeadlineHours: Math.max(1, Number(form.elements.paymentDeadlineHours.value || 48)),
  };

  return {
    id: String(form.elements.id.value || "").trim(),
    slug,
    title,
    category: getCategoryValue(),
    sortOrder: Number(form.elements.sortOrder.value || 0),
    durationLabel: String(dom.durationSelect?.value || "1시간").trim(),
    levelLabel: difficulty,
    audienceLabel: "",
    price: workshopType === "daily" ? attendeePrices[1] : fixedPrice,
    maxCapacity: workshopType === "daily" ? bookingConfig.dailyCapacity : maxCapacity,
    capacityLabel: (workshopType === "daily" ? bookingConfig.dailyCapacity : maxCapacity) > 0
      ? `최대 ${workshopType === "daily" ? bookingConfig.dailyCapacity : maxCapacity}명`
      : "",
    summary: String(form.elements.summary.value || "").trim(),
    description: String(form.elements.description.value || "").trim(),
    hostName: String(form.elements.hostName.value || "").trim(),
    locationName: String(form.elements.locationName.value || "").trim(),
    locationAddress: String(form.elements.locationAddress.value || "").trim(),
    locationDetail: String(form.elements.locationDetail.value || "").trim(),
    bookingNotice: String(form.elements.bookingNotice.value || DEFAULT_BOOKING_NOTICE).trim() || DEFAULT_BOOKING_NOTICE,
    materials: readLines(form.elements.materials.value),
    thingsToBring: readLines(form.elements.thingsToBring.value),
    posterImageUrl: primaryImage.url,
    posterImageR2Key: primaryImage.r2Key,
    posterImageAlt: primaryImage.caption || title,
    galleryImages,
    scheduleSlots: workshopType === "daily" ? [] : scheduleSlots,
    bookingConfig,
    status: statusOverride || current?.status || "draft",
    sourceMode: String(form.elements.sourceMode.value || "d1-r2-ready").trim() || "d1-r2-ready",
    publishedAt: String(form.elements.publishedAt.value || current?.publishedAt || "").trim(),
  };
}

function reorderItems(items, fromIndex, toIndex) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }
  const [moved] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, moved);
  return items;
}

function renderAll() {
  renderWorkshopOptions();
  syncSelectedReservation();
  renderReservations();
  renderGroups();
  renderBlocks();
  renderDetail();
  renderContentList();

  const selectedContent = getSelectedContentItem();
  if (selectedContent) {
    resetContentForm(selectedContent);
  } else if (!dom.contentForm.elements.title.value) {
    resetContentForm();
  }
}

function resetUi() {
  state.reservations = [];
  state.groups = [];
  state.blocks = [];
  state.workshops = [];
  state.contentItems = [];
  state.selectedReservationId = "";
  state.selectedContentSlug = "";
  state.reservationWorkshopFilter = "all";
  state.uiMode = "workshops";
  state.isDirty = false;
  renderAll();
  applyAccessState();
  setStatus(dom.listStatus, "");
  setStatus(dom.groupStatus, "");
  setStatus(dom.blockStatus, "");
  setStatus(dom.detailStatus, "");
  setStatus(dom.contentListStatus, "");
  setStatus(dom.contentStatus, "새 워크숍 초안을 작성 중입니다.");
}

function lockSurface(message = "", type = "info") {
  clearAdminAccess();
  if (dom.authForm) {
    dom.authForm.elements.adminSecret.value = "";
  }
  resetUi();
  setStatus(dom.authStatus, message, type);
}

async function loadSnapshot({ query = "", status = "all", fatalOnAuthError = false } = {}) {
  if (!state.isAuthorized || !state.accessToken) {
    setStatus(dom.listStatus, "관리자 세션을 먼저 활성화해주세요.", "error");
    return false;
  }

  setStatus(dom.listStatus, "워크숍 운영 데이터를 불러오는 중입니다.");

  try {
    const payload = await requestAdmin(`/api/workshops/admin?query=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}&limit=40`);
    applySnapshotPayload(payload);
    renderAll();

    const visibleCount = getVisibleReservations().length;
    setStatus(dom.listStatus, `${visibleCount}건의 신청자를 표시하고 있습니다.`, "success");
    setStatus(dom.contentListStatus, state.contentItems.length ? `${state.contentItems.length}개의 워크숍이 준비되어 있습니다.` : "아직 저장된 워크숍이 없습니다. 새 워크숍부터 시작하세요.", "success");
    return true;
  } catch (error) {
    if (error.status === 401) {
      lockSurface("관리자 세션이 만료되었거나 유효하지 않습니다. 다시 잠금 해제해주세요.", "error");
      if (fatalOnAuthError) throw error;
      return false;
    }
    if (error.status === 503) {
      lockSurface("워크숍 운영 기능에 필요한 D1 또는 관리자 설정이 아직 준비되지 않았습니다.", "error");
      if (fatalOnAuthError) throw error;
      return false;
    }
    setStatus(dom.listStatus, error.message || "워크숍 운영 데이터를 불러오지 못했습니다.", "error");
    return false;
  }
}

async function submitAdminAction(body, { successTarget, successMessage, loadingButton = null, loadingText = "처리 중…", afterSuccess } = {}) {
  setButtonLoading(loadingButton, true, loadingText);

  try {
    const payload = await requestAdmin("/api/workshops/admin", {
      method: "POST",
      body,
    });
    applySnapshotPayload(payload);
    if (typeof afterSuccess === "function") {
      afterSuccess(payload);
    }
    renderAll();
    if (successTarget) {
      setStatus(successTarget, payload.message || successMessage || "저장했습니다.", "success");
    }
    return payload;
  } catch (error) {
    if (error.status === 401) {
      lockSurface("관리자 세션이 만료되었거나 유효하지 않습니다. 다시 잠금 해제해주세요.", "error");
      return null;
    }
    setStatus(successTarget, error.message || "요청을 처리하지 못했습니다.", "error");
    return null;
  } finally {
    setButtonLoading(loadingButton, false, loadingText);
  }
}

async function saveWorkshopContent(nextStatus, button) {
  const workshop = collectWorkshopPayload(nextStatus);
  if (!workshop.title) {
    focusWorkshopField("title", "워크숍 제목을 먼저 입력해주세요.");
    return null;
  }

  if (nextStatus === "published") {
    if (workshop.bookingConfig.workshopType === "event" && workshop.scheduleSlots.length !== 1) {
      focusWorkshopField(dom.slotList?.querySelector('[name="slotDate"]'), "일일 워크샵 이벤트는 날짜와 시작 시간이 있는 세션을 정확히 1개 입력해주세요.");
      return null;
    }
    if (workshop.bookingConfig.workshopType === "multiSession" && workshop.scheduleSlots.length < 2) {
      focusWorkshopField(dom.slotList?.querySelector('[name="slotDate"]'), "다회차 워크샵은 날짜와 시작 시간이 있는 세션을 2개 이상 입력해주세요.");
      return null;
    }
    if (workshop.bookingConfig.workshopType === "daily" && workshop.bookingConfig.dailyStartTime >= workshop.bookingConfig.dailyEndTime) {
      focusWorkshopField("dailyEndTime", "날짜 신청형 워크숍의 종료 시간은 시작 시간보다 늦어야 합니다.");
      return null;
    }
    if (workshop.bookingConfig.minParticipants > workshop.bookingConfig.maxParticipants) {
      focusWorkshopField("minParticipants", "최소 모집 인원은 최대 모집 인원보다 클 수 없습니다.");
      return null;
    }
    if (workshop.bookingConfig.workshopType === "daily" && Object.values(workshop.bookingConfig.attendeePrices).some((price) => price <= 0)) {
      focusWorkshopField("priceOne", "일일 워크샵의 1~4인 가격을 모두 입력해주세요.");
      return null;
    }
    if (workshop.bookingConfig.workshopType !== "daily" && workshop.bookingConfig.fixedPrice <= 0) {
      focusWorkshopField("fixedPrice", "확정형 또는 다회차 워크숍의 고정 가격을 입력해주세요.");
      return null;
    }
    if (!workshop.posterImageUrl && !workshop.posterImageR2Key) {
      focusWorkshopField(dom.posterUploadButton, "게시하려면 대표 포스터 이미지를 업로드해주세요.");
      return null;
    }
  }

  const requestedSlug = workshop.slug || state.selectedContentSlug || "";

  return submitAdminAction({
    action: "saveWorkshopContent",
    workshop,
  }, {
    successTarget: dom.contentStatus,
    successMessage: nextStatus === "published" ? "워크숍을 발행 상태로 저장했습니다." : "워크숍 초안을 저장했습니다.",
    loadingButton: button,
    loadingText: nextStatus === "published" ? "발행 중…" : "저장 중…",
    afterSuccess: () => {
      state.selectedContentSlug = workshop.slug || requestedSlug || state.selectedContentSlug;
      setDirtyState(false);
    },
  });
}

async function archiveSelectedWorkshop() {
  const selectedContent = getSelectedContentItem();
  if (!selectedContent?.slug) {
    setStatus(dom.contentStatus, "보관할 워크숍을 먼저 선택해주세요.", "error");
    return;
  }

  await submitAdminAction({
    action: "archiveWorkshopContent",
    slug: selectedContent.slug,
  }, {
    successTarget: dom.contentStatus,
    successMessage: "워크숍을 보관 상태로 변경했습니다.",
    loadingButton: dom.archiveButton,
    loadingText: "보관 중…",
    afterSuccess: () => {
      state.selectedContentSlug = selectedContent.slug;
    },
  });
}

async function uploadWorkshopImage(file, target = "media") {
  const formData = new FormData();
  formData.append("action", "uploadWorkshopImage");

  const slugSource = String(dom.contentForm?.elements.slug.value || "").trim()
    || slugifyText(dom.contentForm?.elements.title?.value || "")
    || state.selectedContentSlug
    || "draft-workshop";

  formData.append("slug", slugSource);
  formData.append("target", target);
  formData.append("file", file);

  return requestAdmin("/api/workshops/admin", {
    method: "POST",
    body: formData,
  });
}

async function uploadImageFiles(files, target = "gallery") {
  const list = Array.from(files || []).filter((file) => String(file?.type || "").startsWith("image/"));
  if (!list.length) return;

  const isPoster = target === "poster";
  const button = isPoster ? dom.posterUploadButton : dom.galleryUploadButton;
  setButtonLoading(button, true, "업로드 중…");
  setStatus(dom.contentStatus, `${list.length}개 이미지 업로드 중입니다.`);

  const items = isPoster ? collectPosterItems() : collectGalleryItems();

  try {
    for (const file of list) {
      const payload = await uploadWorkshopImage(file, target);
      const image = payload.image || {};
      items.push({
        url: String(image.url || "").trim(),
        r2Key: String(image.key || "").trim(),
        caption: "",
        kind: isPoster ? "poster" : "gallery",
      });
    }

    if (isPoster) {
      renderPosterRows(items);
    } else {
      renderGalleryRows(items);
    }
    setDirtyState(true);
    setStatus(dom.contentStatus, `${list.length}개 이미지를 업로드했습니다.`, "success");
  } catch (error) {
    if (error.status === 401) {
      lockSurface("관리자 세션이 만료되었거나 유효하지 않습니다. 다시 잠금 해제해주세요.", "error");
    } else {
      setStatus(dom.contentStatus, error.message || "이미지 업로드 중 오류가 발생했습니다.", "error");
    }
  } finally {
    setButtonLoading(button, false, "업로드 중…");
    if (isPoster && dom.posterUploadInput) dom.posterUploadInput.value = "";
    if (!isPoster && dom.galleryUploadInput) dom.galleryUploadInput.value = "";
  }
}

function setupDropzone(dropzone, input, target = "gallery") {
  if (!dropzone) return;

  const setDragOver = (value) => {
    dropzone.classList.toggle("is-dragover", value);
  };

  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    setDragOver(true);
  });

  dropzone.addEventListener("dragleave", () => {
    setDragOver(false);
  });

  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    setDragOver(false);
    const files = event.dataTransfer?.files;
    if (files?.length) {
      uploadImageFiles(files, target);
    }
  });

  dropzone.addEventListener("click", () => {
    input?.click();
  });

  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input?.click();
    }
  });
}

function attachEvents() {
  dom.authForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = dom.authForm.querySelector('button[type="submit"]');
    const secret = String(dom.authForm.elements.adminSecret.value || "").trim();
    if (!secret) {
      setStatus(dom.authStatus, "관리자 키를 입력해주세요.", "error");
      return;
    }

    setButtonLoading(submitButton, true, "확인 중…");
    setStatus(dom.authStatus, "관리자 세션을 확인하는 중입니다.");

    try {
      const session = await createAdminSession(secret);
      persistAdminAccess(session.accessToken, session.expiresAt);
      state.isAuthorized = true;
      dom.authForm.elements.adminSecret.value = "";
      applyAccessState();
      await loadSnapshot({ query: String(dom.searchInput?.value || ""), status: String(dom.statusFilter?.value || "all"), fatalOnAuthError: true });
      setStatus(dom.authStatus, `관리자 세션을 활성화했습니다. 약 ${formatSessionRemaining(session.expiresAt)} 후 다시 인증됩니다.`, "success");
    } catch (error) {
      if (error.status === 401) {
        lockSurface("관리자 키를 다시 확인해주세요.", "error");
      } else {
        lockSurface(error.message || "관리자 세션을 활성화하지 못했습니다.", "error");
      }
    } finally {
      setButtonLoading(submitButton, false, "확인 중…");
    }
  });

  dom.authClear?.addEventListener("click", () => {
    lockSurface("관리자 세션을 초기화했습니다.");
  });

  dom.searchButton?.addEventListener("click", () => {
    loadSnapshot({ query: String(dom.searchInput?.value || ""), status: String(dom.statusFilter?.value || "all") });
  });

  dom.searchInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    loadSnapshot({ query: String(dom.searchInput?.value || ""), status: String(dom.statusFilter?.value || "all") });
  });

  dom.refreshButton?.addEventListener("click", () => {
    if (dom.searchInput) dom.searchInput.value = "";
    if (dom.statusFilter) dom.statusFilter.value = "all";
    loadSnapshot({ query: "", status: "all" });
  });

  dom.groupRefreshButton?.addEventListener("click", () => {
    loadSnapshot({ query: String(dom.searchInput?.value || ""), status: String(dom.statusFilter?.value || "all") });
  });

  dom.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!confirmDiscardUnsavedChanges()) return;
      setUiMode(String(button.dataset.mode || "workshops"));
    });
  });

  const syncModeFromLocation = () => {
    const nextMode = getUiModeFromHash();
    if (nextMode === state.uiMode) return;
    if (!confirmDiscardUnsavedChanges()) {
      syncUiModeHash(state.uiMode, { replace: true });
      return;
    }
    setUiMode(nextMode, { syncHash: false });
  };
  window.addEventListener("hashchange", syncModeFromLocation);
  window.addEventListener("popstate", syncModeFromLocation);

  dom.reservationWorkshopFilter?.addEventListener("change", () => {
    state.reservationWorkshopFilter = String(dom.reservationWorkshopFilter.value || "all");
    syncSelectedReservation();
    renderReservations();
    renderDetail();
    setStatus(dom.detailStatus, "");
  });

  dom.reservationList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-reservation-id]");
    if (!button) return;
    setUiMode("reservations");
    state.selectedReservationId = button.dataset.reservationId || "";
    renderReservations();
    renderDetail();
    setStatus(dom.detailStatus, "");
  });

  dom.blockForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = dom.blockForm.querySelector('button[type="submit"]');

    const result = await submitAdminAction({
      action: "blockDate",
      slotDate: String(dom.blockForm.elements.slotDate.value || "").trim(),
      reason: String(dom.blockForm.elements.reason.value || "").trim(),
    }, {
      successTarget: dom.blockStatus,
      successMessage: "해당 날짜를 예약 불가로 등록했습니다.",
      loadingButton: submitButton,
    });

    if (result) {
      dom.blockForm.elements.slotDate.value = "";
      dom.blockForm.elements.reason.value = "";
    }
  });

  dom.blockList?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-block-id]");
    if (!button) return;
    await submitAdminAction({
      action: "unblockDate",
      blockId: button.dataset.blockId || "",
    }, {
      successTarget: dom.blockStatus,
      successMessage: "차단 일정을 해제했습니다.",
      loadingButton: button,
      loadingText: "해제 중…",
    });
  });

  dom.cancelButton?.addEventListener("click", async () => {
    const reservation = getSelectedReservation();
    if (!reservation) return;
    await submitAdminAction({
      action: "cancelReservation",
      reservationId: reservation.reservationId,
    }, {
      successTarget: dom.detailStatus,
      successMessage: "예약을 취소 상태로 변경했습니다.",
      loadingButton: dom.cancelButton,
      loadingText: "취소 중…",
    });
  });

  dom.restoreButton?.addEventListener("click", async () => {
    const reservation = getSelectedReservation();
    if (!reservation) return;
    await submitAdminAction({
      action: "restoreReservation",
      reservationId: reservation.reservationId,
    }, {
      successTarget: dom.detailStatus,
      successMessage: "예약을 다시 확정 상태로 되돌렸습니다.",
      loadingButton: dom.restoreButton,
      loadingText: "복원 중…",
    });
  });

  dom.refundButton?.addEventListener("click", async () => {
    const reservation = getSelectedReservation();
    if (!reservation || reservation.paymentStatus !== "paid") return;
    if (!window.confirm("이 워크숍 결제를 전액 환불하고 신청을 취소할까요?")) return;

    await submitAdminAction({
      action: "refundWorkshopPayment",
      reservationId: reservation.reservationId,
    }, {
      successTarget: dom.detailStatus,
      successMessage: "워크숍 결제를 환불 처리했습니다.",
      loadingButton: dom.refundButton,
      loadingText: "환불 중…",
    });
  });

  dom.groupList?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-group-action]");
    if (!button) return;

    const groupId = String(button.dataset.groupId || "").trim();
    const groupAction = String(button.dataset.groupAction || "").trim();
    if (!groupId || !groupAction) return;

    if (groupAction === "cancel" && !window.confirm("미결제 신청을 취소하고 이 그룹을 종료할까요?")) {
      return;
    }

    const action = groupAction === "finalize"
      ? "finalizeWorkshopGroup"
      : groupAction === "send-payment"
        ? "sendWorkshopPaymentRequest"
        : "cancelWorkshopGroup";
    const successMessage = groupAction === "finalize"
      ? "그룹을 마감하고 최종 결제 금액을 계산했습니다."
      : groupAction === "send-payment"
        ? "결제 요청을 처리했습니다."
        : "워크숍 그룹을 취소했습니다.";

    await submitAdminAction({ action, groupId }, {
      successTarget: dom.groupStatus,
      successMessage,
      loadingButton: button,
      loadingText: groupAction === "finalize" ? "마감 중…" : groupAction === "send-payment" ? "요청 중…" : "취소 중…",
    });
  });

  dom.contentList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-content-slug]");
    if (!button) return;
    if (!confirmDiscardUnsavedChanges()) return;
    setUiMode("workshops");
    state.selectedContentSlug = button.dataset.contentSlug || "";
    renderContentList();
    resetContentForm(getSelectedContentItem() || {});
  });

  dom.contentNewButton?.addEventListener("click", () => {
    if (!confirmDiscardUnsavedChanges()) return;
    setUiMode("workshops");
    state.selectedContentSlug = "";
    renderContentList();
    resetContentForm();
  });

  dom.categorySelect?.addEventListener("change", syncCategoryField);

  dom.bookingModeSelect?.addEventListener("change", () => {
    applyBookingModeUi(dom.bookingModeSelect.value);
    setDirtyState(true);
    syncDirtyIndicator();
  });

  dom.contentForm?.elements.title?.addEventListener("input", () => {
    const slugField = dom.contentForm?.elements.slug;
    if (!slugField) return;
    if (!String(slugField.value || "").trim()) {
      slugField.value = slugifyText(dom.contentForm.elements.title.value || "");
    }
  });

  dom.contentForm?.addEventListener("input", () => {
    setDirtyState(true);
    syncDirtyIndicator();
  });

  dom.contentForm?.addEventListener("change", () => {
    setDirtyState(true);
    syncDirtyIndicator();
  });

  dom.posterUploadButton?.addEventListener("click", () => {
    dom.posterUploadInput?.click();
  });

  dom.posterUploadInput?.addEventListener("change", async (event) => {
    await uploadImageFiles(event.target.files, "poster");
  });

  dom.galleryUploadInput?.addEventListener("change", async (event) => {
    await uploadImageFiles(event.target.files, "gallery");
  });

  dom.posterList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-poster-remove]");
    if (!button) return;
    renderPosterRows([]);
    setDirtyState(true);
  });

  dom.galleryList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-gallery-remove]");
    if (!button) return;
    const index = Number(button.dataset.galleryRemove);
    const items = collectGalleryItems();
    items.splice(index, 1);
    renderGalleryRows(items);
  });

  dom.posterList?.addEventListener("dragstart", (event) => {
    const item = event.target.closest(".js-workshop-admin-poster-item");
    if (!item) return;
    const index = Number(item.dataset.posterIndex);
    state.draggingPosterIndex = Number.isFinite(index) ? index : null;
    item.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
  });

  dom.posterList?.addEventListener("dragend", (event) => {
    const item = event.target.closest(".js-workshop-admin-poster-item");
    if (item) {
      item.classList.remove("is-dragging");
    }
    state.draggingPosterIndex = null;
  });

  dom.posterList?.addEventListener("dragover", (event) => {
    const target = event.target.closest(".js-workshop-admin-poster-item");
    if (!target) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });

  dom.posterList?.addEventListener("drop", (event) => {
    const target = event.target.closest(".js-workshop-admin-poster-item");
    if (!target) return;
    event.preventDefault();
    const toIndex = Number(target.dataset.posterIndex);
    if (!Number.isFinite(state.draggingPosterIndex) || !Number.isFinite(toIndex)) return;
    const reordered = reorderItems(collectPosterItems(), state.draggingPosterIndex, toIndex);
    renderPosterRows(reordered);
    state.draggingPosterIndex = null;
  });

  dom.galleryList?.addEventListener("dragstart", (event) => {
    const item = event.target.closest(".js-workshop-admin-gallery-item");
    if (!item) return;
    const index = Number(item.dataset.galleryIndex);
    state.draggingGalleryIndex = Number.isFinite(index) ? index : null;
    item.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
  });

  dom.galleryList?.addEventListener("dragend", (event) => {
    const item = event.target.closest(".js-workshop-admin-gallery-item");
    if (item) {
      item.classList.remove("is-dragging");
    }
    state.draggingGalleryIndex = null;
  });

  dom.galleryList?.addEventListener("dragover", (event) => {
    const target = event.target.closest(".js-workshop-admin-gallery-item");
    if (!target) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });

  dom.galleryList?.addEventListener("drop", (event) => {
    const target = event.target.closest(".js-workshop-admin-gallery-item");
    if (!target) return;
    event.preventDefault();
    const toIndex = Number(target.dataset.galleryIndex);
    if (!Number.isFinite(state.draggingGalleryIndex) || !Number.isFinite(toIndex)) return;
    const reordered = reorderItems(collectGalleryItems(), state.draggingGalleryIndex, toIndex);
    renderGalleryRows(reordered);
    state.draggingGalleryIndex = null;
    setDirtyState(true);
  });

  setupDropzone(dom.posterDropzone, dom.posterUploadInput, "poster");
  setupDropzone(dom.galleryDropzone, dom.galleryUploadInput, "gallery");

  dom.slotAddButton?.addEventListener("click", () => {
    const current = collectSlotItems();
    const base = current[current.length - 1] || current[0] || {};
    renderSlotRows([...current, {
      _key: "",
      date: base.date || "",
      startTime: base.startTime || "",
      endTime: base.endTime || "",
      capacity: Number(base.capacity || dom.contentForm?.elements.maxCapacity?.value || 1),
      status: base.status || "open",
    }]);
    setDirtyState(true);
  });

  dom.slotList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-slot-remove]");
    const duplicateButton = event.target.closest("[data-slot-duplicate]");
    if (duplicateButton) {
      const index = Number(duplicateButton.dataset.slotDuplicate);
      const items = collectSlotItems();
      const source = items[index];
      if (source) {
        items.splice(index + 1, 0, { ...source, _key: "" });
        renderSlotRows(items);
        setDirtyState(true);
      }
      return;
    }
    if (!button) return;
    const index = Number(button.dataset.slotRemove);
    const items = collectSlotItems();
    items.splice(index, 1);
    renderSlotRows(items);
    setDirtyState(true);
  });

  dom.saveDraftButton?.addEventListener("click", () => {
    saveWorkshopContent("draft", dom.saveDraftButton);
  });

  dom.previewButton?.addEventListener("click", previewSelectedWorkshop);

  dom.publishButton?.addEventListener("click", () => {
    saveWorkshopContent("published", dom.publishButton);
  });

  dom.archiveButton?.addEventListener("click", () => {
    archiveSelectedWorkshop();
  });

  window.addEventListener("beforeunload", (event) => {
    if (!isWorkshopEditorDirty()) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

state.uiMode = getUiModeFromHash();
if (!window.location.hash) syncUiModeHash(state.uiMode, { replace: true });
attachEvents();
applyAccessState();
renderWorkshopOptions();
renderReservations();
renderBlocks();
renderDetail();
renderContentList();
resetContentForm();

if (state.accessToken) {
  verifyAdminSession()
    .then(async (payload) => {
      state.isAuthorized = true;
      persistAdminAccess(state.accessToken, payload.expiresAt || state.accessExpiresAt);
      applyAccessState();
      await loadSnapshot({ query: "", status: "all", fatalOnAuthError: true });
      setStatus(dom.authStatus, `관리자 세션이 복원되었습니다. 약 ${formatSessionRemaining(state.accessExpiresAt)} 후 다시 인증됩니다.`, "success");
    })
    .catch((error) => {
      lockSurface(error.status === 401 ? "저장된 관리자 세션이 만료되었거나 유효하지 않습니다. 다시 잠금 해제해주세요." : (error.message || "관리자 세션을 확인하지 못했습니다."), "error");
    });
}
