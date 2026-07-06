const ADMIN_ACCESS_TOKEN_KEY = "studiooalum:order-admin-access-token";
const ADMIN_ACCESS_EXPIRES_AT_KEY = "studiooalum:order-admin-access-expires-at";

const dom = {
  authForm: document.querySelector(".js-workshop-admin-auth-form"),
  authClear: document.querySelector(".js-workshop-admin-auth-clear"),
  authStatus: document.querySelector(".js-workshop-admin-auth-status"),
  authGuards: Array.from(document.querySelectorAll("[data-workshop-admin-auth-guard]")),
  accessBadge: document.querySelector(".js-workshop-admin-access-badge"),
  accessCopy: document.querySelector(".js-workshop-admin-access-copy"),
  accessMeta: document.querySelector(".js-workshop-admin-access-meta"),
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
  blockForm: document.querySelector(".js-workshop-admin-block-form"),
  workshopSelect: document.querySelector(".js-workshop-admin-workshop-select"),
  blockStatus: document.querySelector(".js-workshop-admin-block-status"),
  blockList: document.querySelector(".js-workshop-admin-block-list"),
};

const state = {
  accessToken: sessionStorage.getItem(ADMIN_ACCESS_TOKEN_KEY) || "",
  accessExpiresAt: sessionStorage.getItem(ADMIN_ACCESS_EXPIRES_AT_KEY) || "",
  isAuthorized: false,
  reservations: [],
  blocks: [],
  workshops: [],
  selectedReservationId: "",
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function resetData() {
  state.reservations = [];
  state.blocks = [];
  state.workshops = [];
  state.selectedReservationId = "";
  renderReservations();
  renderBlocks();
  renderWorkshopOptions();
  renderDetail();
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
      ? "워크숍 예약과 차단 일정을 관리할 수 있습니다. 브라우저에는 짧은 관리자 세션만 유지합니다."
      : "관리자 인증 전에는 예약 데이터와 차단 일정이 로드되지 않습니다.";
  }

  if (dom.accessMeta) {
    dom.accessMeta.textContent = unlocked
      ? `세션 만료 예정: ${formatDate(state.accessExpiresAt)} · 약 ${formatSessionRemaining(state.accessExpiresAt)} 후 다시 인증됩니다.`
      : "ORDER_ADMIN_SECRET 원문은 브라우저에 저장하지 않습니다.";
  }
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
  const response = await fetch(url, {
    method,
    headers: getAuthHeaders(body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
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

function getSelectedReservation() {
  return state.reservations.find((reservation) => reservation.reservationId === state.selectedReservationId) || null;
}

function renderWorkshopOptions() {
  if (!dom.workshopSelect) return;
  dom.workshopSelect.innerHTML = "";
  if (!state.workshops.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "워크숍을 불러오는 중입니다.";
    dom.workshopSelect.appendChild(option);
    return;
  }

  for (const workshop of state.workshops) {
    const option = document.createElement("option");
    option.value = workshop.slug;
    option.textContent = workshop.title;
    dom.workshopSelect.appendChild(option);
  }
}

function renderReservations() {
  if (!dom.reservationList) return;
  if (!state.reservations.length) {
    dom.reservationList.innerHTML = '<div class="fulfillment-empty">조회된 워크숍 예약이 없습니다.</div>';
    return;
  }

  dom.reservationList.innerHTML = state.reservations.map((reservation) => {
    const activeClass = reservation.reservationId === state.selectedReservationId ? " is-active" : "";
    return `
      <button type="button" class="fulfillment-order-card${activeClass}" data-reservation-id="${escapeHtml(reservation.reservationId)}">
        <div class="fulfillment-order-card__top">
          <strong>${escapeHtml(reservation.workshopTitle || reservation.workshopSlug || "워크숍")}</strong>
          <span>${escapeHtml(reservation.status === "cancelled" ? "취소" : "확정")}</span>
        </div>
        <p class="fulfillment-order-card__meta">${escapeHtml(reservation.fullName || "예약자")} · ${escapeHtml(reservation.email || "")}</p>
        <p class="fulfillment-order-card__meta">${escapeHtml(reservation.slotDate || "")} · ${escapeHtml([reservation.slotStartTime, reservation.slotEndTime].filter(Boolean).join(" - ") || reservation.slotLabel || "")}</p>
      </button>
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
        <strong>${escapeHtml(block.workshopTitle || block.workshopSlug)}</strong>
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
        <strong>${escapeHtml(reservation.status === "cancelled" ? "취소" : "확정")}</strong>
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
}

function resetUi() {
  resetData();
  applyAccessState();
  setStatus(dom.listStatus, "");
  setStatus(dom.blockStatus, "");
  setStatus(dom.detailStatus, "");
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

  setStatus(dom.listStatus, "워크숍 예약 정보를 불러오는 중입니다.");

  try {
    const payload = await requestAdmin(`/api/workshops/admin?query=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}&limit=40`);
    state.reservations = Array.isArray(payload.reservations) ? payload.reservations : [];
    state.blocks = Array.isArray(payload.blocks) ? payload.blocks : [];
    state.workshops = Array.isArray(payload.workshops) ? payload.workshops : [];
    if (state.selectedReservationId) {
      const stillSelected = state.reservations.find((reservation) => reservation.reservationId === state.selectedReservationId);
      if (!stillSelected) {
        state.selectedReservationId = state.reservations[0]?.reservationId || "";
      }
    } else {
      state.selectedReservationId = state.reservations[0]?.reservationId || "";
    }
    renderWorkshopOptions();
    renderReservations();
    renderBlocks();
    renderDetail();
    setStatus(dom.listStatus, state.reservations.length ? `${state.reservations.length}건의 예약을 불러왔습니다.` : "조회된 예약이 없습니다.", "success");
    return true;
  } catch (error) {
    if (error.status === 401) {
      lockSurface("관리자 세션이 만료되었거나 유효하지 않습니다. 다시 잠금 해제해주세요.", "error");
      if (fatalOnAuthError) throw error;
      return false;
    }
    if (error.status === 503) {
      lockSurface("워크숍 예약 관리 기능에 필요한 D1 또는 관리자 설정이 아직 준비되지 않았습니다.", "error");
      if (fatalOnAuthError) throw error;
      return false;
    }
    setStatus(dom.listStatus, error.message || "워크숍 예약 정보를 불러오지 못했습니다.", "error");
    return false;
  }
}

async function submitAdminAction(body, { successTarget, successMessage, loadingButton = null, loadingText = "처리 중…" } = {}) {
  setButtonLoading(loadingButton, true, loadingText);

  try {
    const payload = await requestAdmin("/api/workshops/admin", {
      method: "POST",
      body,
    });
    state.reservations = Array.isArray(payload.reservations) ? payload.reservations : [];
    state.blocks = Array.isArray(payload.blocks) ? payload.blocks : [];
    state.workshops = Array.isArray(payload.workshops) ? payload.workshops : [];
    if (!state.reservations.find((reservation) => reservation.reservationId === state.selectedReservationId)) {
      state.selectedReservationId = state.reservations[0]?.reservationId || "";
    }
    renderWorkshopOptions();
    renderReservations();
    renderBlocks();
    renderDetail();
    if (successTarget) {
      setStatus(successTarget, payload.message || successMessage || "저장했습니다.", "success");
    }
    setStatus(dom.listStatus, state.reservations.length ? `${state.reservations.length}건의 예약을 불러왔습니다.` : "조회된 예약이 없습니다.", "success");
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

dom.refreshButton?.addEventListener("click", () => {
  if (dom.searchInput) dom.searchInput.value = "";
  if (dom.statusFilter) dom.statusFilter.value = "all";
  loadSnapshot({ query: "", status: "all" });
});

dom.reservationList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-reservation-id]");
  if (!button) return;
  state.selectedReservationId = button.dataset.reservationId || "";
  renderReservations();
  renderDetail();
  setStatus(dom.detailStatus, "");
});

dom.blockForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = dom.blockForm.querySelector('button[type="submit"]');
  const selectedOption = dom.workshopSelect?.selectedOptions?.[0] || null;
  const result = await submitAdminAction({
    action: "blockDate",
    workshopSlug: String(dom.blockForm.elements.workshopSlug.value || "").trim(),
    workshopTitle: selectedOption?.textContent || "",
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

applyAccessState();
renderWorkshopOptions();
renderReservations();
renderBlocks();
renderDetail();

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