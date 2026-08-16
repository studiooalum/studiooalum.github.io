const ADMIN_ACCESS_TOKEN_KEY = "studiooalum:order-admin-access-token";
const ADMIN_ACCESS_EXPIRES_AT_KEY = "studiooalum:order-admin-access-expires-at";

const dom = {
  authForm: document.querySelector(".js-repair-admin-auth-form"),
  authClear: document.querySelector(".js-repair-admin-auth-clear"),
  authStatus: document.querySelector(".js-repair-admin-auth-status"),
  authGuards: Array.from(document.querySelectorAll("[data-repair-admin-auth-guard]")),
  refresh: document.querySelector(".js-repair-admin-refresh"),
  statusFilter: document.querySelector(".js-repair-admin-status-filter"),
  listStatus: document.querySelector(".js-repair-admin-list-status"),
  requestList: document.querySelector(".js-repair-admin-request-list"),
  empty: document.querySelector(".js-repair-admin-empty"),
  form: document.querySelector(".js-repair-admin-form"),
  requestNumber: document.querySelector(".js-repair-admin-request-number"),
  title: document.querySelector(".js-repair-admin-title"),
  createdAt: document.querySelector(".js-repair-admin-created-at"),
  customer: document.querySelector(".js-repair-admin-customer"),
  archiveCandidate: document.querySelector(".js-repair-admin-archive-candidate"),
  imageCount: document.querySelector(".js-repair-admin-image-count"),
  imageList: document.querySelector(".js-repair-admin-image-list"),
  save: document.querySelector(".js-repair-admin-save"),
  formStatus: document.querySelector(".js-repair-admin-form-status"),
};

const state = {
  accessToken: sessionStorage.getItem(ADMIN_ACCESS_TOKEN_KEY) || "",
  accessExpiresAt: sessionStorage.getItem(ADMIN_ACCESS_EXPIRES_AT_KEY) || "",
  isAuthorized: false,
  requests: [],
  selectedId: "",
  imageUrls: [],
};

const STATUS_LABELS = {
  received: "접수됨",
  reviewing: "검토 중",
  quoted: "예상 가격 안내",
  approved: "진행 승인",
  in_progress: "작업 중",
  completed: "작업 완료",
  rejected: "진행 불가",
  cancelled: "취소",
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  if (!value) return "-";
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

function formatPrice(value) {
  if (value === null || value === undefined || value === "") return "미정";
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function setStatus(target, message = "", type = "info") {
  if (!target) return;
  target.textContent = message;
  target.classList.remove("is-success", "is-error");
  if (type === "success") target.classList.add("is-success");
  if (type === "error") target.classList.add("is-error");
}

function setButtonLoading(button, loading, label) {
  if (!button) return;
  if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent || "";
  button.disabled = loading;
  button.textContent = loading ? label : button.dataset.defaultLabel;
}

function persistAdminAccess(token, expiresAt = "") {
  state.accessToken = String(token || "").trim();
  state.accessExpiresAt = String(expiresAt || "").trim();

  if (state.accessToken) sessionStorage.setItem(ADMIN_ACCESS_TOKEN_KEY, state.accessToken);
  else sessionStorage.removeItem(ADMIN_ACCESS_TOKEN_KEY);
  if (state.accessExpiresAt) sessionStorage.setItem(ADMIN_ACCESS_EXPIRES_AT_KEY, state.accessExpiresAt);
  else sessionStorage.removeItem(ADMIN_ACCESS_EXPIRES_AT_KEY);
}

function clearImageUrls() {
  state.imageUrls.forEach((url) => URL.revokeObjectURL(url));
  state.imageUrls = [];
}

function clearAdminAccess() {
  persistAdminAccess("", "");
  state.isAuthorized = false;
}

function getAuthHeaders(includeJson = false) {
  const headers = { Accept: "application/json" };
  if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;
  if (includeJson) headers["Content-Type"] = "application/json";
  return headers;
}

async function requestAdmin(url, { method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: getAuthHeaders(body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
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
    headers: { Accept: "application/json", "Content-Type": "application/json" },
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

function getSelectedRequest() {
  return state.requests.find((request) => request.id === state.selectedId) || null;
}

function applyAccessState() {
  const unlocked = Boolean(state.isAuthorized && state.accessToken);
  dom.authGuards.forEach((element) => {
    element.hidden = !unlocked;
  });
}

function lockSurface(message = "") {
  clearAdminAccess();
  state.requests = [];
  state.selectedId = "";
  clearImageUrls();
  applyAccessState();
  renderRequestList();
  renderSelectedRequest();
  setStatus(dom.authStatus, message, message ? "error" : "info");
}

function getFilteredRequests() {
  const status = String(dom.statusFilter?.value || "all");
  return status === "all" ? state.requests : state.requests.filter((request) => request.status === status);
}

function renderRequestList() {
  if (!dom.requestList) return;
  const requests = getFilteredRequests();

  if (!requests.length) {
    dom.requestList.innerHTML = '<div class="fulfillment-empty">조건에 맞는 수선 접수가 없습니다.</div>';
    return;
  }

  dom.requestList.innerHTML = requests.map((request) => {
    const active = request.id === state.selectedId ? " is-active" : "";
    const status = STATUS_LABELS[request.status] || request.status;
    return `<button type="button" class="repair-admin-request-card${active}" data-repair-id="${escapeHtml(request.id)}">
      <div class="repair-admin-request-card__top">
        <strong>${escapeHtml(request.customerName || "이름 없음")}</strong>
        <span>${escapeHtml(status)}</span>
      </div>
      <p>${escapeHtml(request.requestNumber)} · ${escapeHtml(request.itemType || "수선 의뢰")}</p>
      <p>${escapeHtml(formatDate(request.createdAt))} · 사진 ${Number(request.images?.length || 0)}장</p>
    </button>`;
  }).join("");
}

function renderCustomerDetails(request) {
  if (!dom.customer) return;
  const privacyConsent = request.privacyConsentAt ? "동의함" : "동의 시각 없음";
  const email = String(request.email || "").trim();
  const legacyDetails = [
    request.material || request.itemMaterial ? `<div><dt>소재</dt><dd>${escapeHtml(request.material || request.itemMaterial)}</dd></div>` : "",
    request.desiredResult ? `<div><dt>원하는 결과</dt><dd>${escapeHtml(request.desiredResult)}</dd></div>` : "",
    request.budgetNote ? `<div><dt>예산 메모</dt><dd>${escapeHtml(request.budgetNote)}</dd></div>` : "",
  ].join("");

  dom.customer.innerHTML = `
    <dl>
      <div><dt>연락처</dt><dd>${escapeHtml(request.phone || "-")}${email ? `<br>${escapeHtml(email)}` : ""}</dd></div>
      <div><dt>수선 의뢰 제품에 대한 설명</dt><dd>${escapeHtml(request.issueDescription || request.repairDetails || "-")}</dd></div>
      <div><dt>수선 의뢰 기한</dt><dd>${escapeHtml(request.desiredCompletionDate || "미입력")}</dd></div>
      ${legacyDetails}
      <div><dt>개인정보 수집 동의</dt><dd>${escapeHtml(privacyConsent)}</dd></div>
    </dl>
  `;
}

function createPrivateImageCard(image, objectUrl) {
  const card = document.createElement("article");
  card.className = "repair-admin-image";

  const element = document.createElement("img");
  element.src = objectUrl;
  element.alt = image.filename || "수선 접수 사진";

  const meta = document.createElement("p");
  meta.textContent = `${image.filename || "이미지"} · ${Math.max(1, Math.round(Number(image.byteSize || 0) / 1024))}KB`;
  card.append(element, meta);
  return card;
}

async function renderPrivateImages(request) {
  if (!dom.imageList) return;
  clearImageUrls();
  dom.imageList.innerHTML = "";

  const images = Array.isArray(request?.images) ? request.images : [];
  if (!images.length) {
    dom.imageList.innerHTML = '<div class="fulfillment-empty">첨부된 사진이 없습니다.</div>';
    return;
  }

  dom.imageList.innerHTML = '<div class="repair-admin-image-loading">보호된 원본 이미지를 불러오는 중입니다.</div>';
  const selectedId = request.id;

  try {
    const entries = await Promise.all(images.map(async (image) => {
      const response = await fetch(image.streamPath, {
        headers: getAuthHeaders(),
        credentials: "same-origin",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const error = new Error(payload?.error || `Image request failed: ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return { image, objectUrl: URL.createObjectURL(await response.blob()) };
    }));

    if (state.selectedId !== selectedId) {
      entries.forEach((entry) => URL.revokeObjectURL(entry.objectUrl));
      return;
    }

    dom.imageList.innerHTML = "";
    entries.forEach(({ image, objectUrl }) => {
      state.imageUrls.push(objectUrl);
      dom.imageList.append(createPrivateImageCard(image, objectUrl));
    });
  } catch (error) {
    if (error.status === 401) {
      lockSurface("관리자 세션이 만료됐습니다. 다시 잠금 해제해주세요.");
      return;
    }
    if (state.selectedId === selectedId) {
      dom.imageList.innerHTML = '<div class="fulfillment-empty">보호된 원본 이미지를 불러오지 못했습니다.</div>';
    }
  }
}

function renderSelectedRequest() {
  const request = getSelectedRequest();
  clearImageUrls();

  if (!request || !dom.form) {
    if (dom.empty) dom.empty.hidden = false;
    if (dom.form) dom.form.hidden = true;
    return;
  }

  if (dom.empty) dom.empty.hidden = true;
  dom.form.hidden = false;
  dom.form.elements.id.value = request.id;
  dom.form.elements.status.value = request.status === "rejected" ? "cancelled" : (request.status || "received");
  dom.form.elements.quoteAmount.value = request.quoteAmount === null || request.quoteAmount === undefined ? "" : String(request.quoteAmount);
  dom.form.elements.finalAmount.value = request.finalAmount === null || request.finalAmount === undefined ? "" : String(request.finalAmount);
  dom.form.elements.customerMessage.value = request.customerMessage || "";
  dom.form.elements.adminNote.value = request.adminNote || "";
  if (dom.requestNumber) dom.requestNumber.textContent = request.requestNumber || "";
  if (dom.title) dom.title.textContent = `${request.customerName || "수선"} · 수선 의뢰`;
  if (dom.createdAt) dom.createdAt.textContent = formatDate(request.createdAt);
  if (dom.imageCount) dom.imageCount.textContent = `${Number(request.images?.length || 0)}장`;
  if (dom.archiveCandidate) {
    dom.archiveCandidate.hidden = !request.isArchiveCandidate;
    dom.archiveCandidate.textContent = request.isArchiveCandidate
      ? "Archive 기록 후보: 공개 동의가 확인된 완료 요청입니다. Archive에는 자동으로 게시되지 않습니다."
      : "";
  }
  renderCustomerDetails(request);
  void renderPrivateImages(request);
}

function applySnapshot(payload) {
  state.requests = Array.isArray(payload?.requests) ? payload.requests : [];
  if (state.selectedId && !getSelectedRequest()) state.selectedId = "";
}

async function loadRequests() {
  if (!state.isAuthorized || !state.accessToken) return;
  setStatus(dom.listStatus, "수선 접수를 불러오는 중입니다.");
  try {
    const payload = await requestAdmin("/api/repairs/admin");
    applySnapshot(payload);
    if (!state.selectedId) state.selectedId = state.requests[0]?.id || "";
    renderRequestList();
    renderSelectedRequest();
    setStatus(dom.listStatus, `${state.requests.length}건의 수선 접수를 불러왔습니다.`, "success");
  } catch (error) {
    if (error.status === 401) {
      lockSurface("관리자 세션이 만료됐습니다. 다시 잠금 해제해주세요.");
    } else {
      setStatus(dom.listStatus, error.message || "수선 접수를 불러오지 못했습니다.", "error");
    }
  }
}

async function saveRequest() {
  const request = getSelectedRequest();
  if (!request || !dom.form) return;

  const rawAmount = String(dom.form.elements.quoteAmount.value || "").trim();
  const quoteAmount = rawAmount ? Number(rawAmount) : null;
  const rawFinalAmount = String(dom.form.elements.finalAmount.value || "").trim();
  const finalAmount = rawFinalAmount ? Number(rawFinalAmount) : null;
  if (rawAmount && (!Number.isInteger(quoteAmount) || quoteAmount < 0)) {
    setStatus(dom.formStatus, "견적 금액을 다시 확인해주세요.", "error");
    dom.form.elements.quoteAmount.focus();
    return;
  }
  if (rawFinalAmount && (!Number.isInteger(finalAmount) || finalAmount < 0)) {
    setStatus(dom.formStatus, "최종 가격을 다시 확인해주세요.", "error");
    dom.form.elements.finalAmount.focus();
    return;
  }

  const button = dom.save;
  setButtonLoading(button, true, "저장 중...");
  setStatus(dom.formStatus, "수선 접수 상태를 저장하는 중입니다.");

  try {
    const payload = await requestAdmin("/api/repairs/admin", {
      method: "POST",
      body: {
        action: "updateRepairRequest",
        request: {
          id: request.id,
          status: dom.form.elements.status.value,
          quoteAmount,
          finalAmount,
          customerMessage: String(dom.form.elements.customerMessage.value || "").trim(),
          adminNote: String(dom.form.elements.adminNote.value || "").trim(),
        },
      },
    });
    applySnapshot(payload);
    renderRequestList();
    renderSelectedRequest();
    setStatus(dom.formStatus, "수선 접수 상태를 저장했습니다.", "success");
  } catch (error) {
    if (error.status === 401) {
      lockSurface("관리자 세션이 만료됐습니다. 다시 잠금 해제해주세요.");
    } else {
      setStatus(dom.formStatus, error.message || "수선 접수 상태를 저장하지 못했습니다.", "error");
    }
  } finally {
    setButtonLoading(button, false, "저장 중...");
  }
}

function bindEvents() {
  dom.authForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const secret = String(dom.authForm.elements.adminSecret.value || "").trim();
    if (!secret) return;
    setStatus(dom.authStatus, "관리자 세션을 확인하는 중입니다.");

    try {
      const session = await createAdminSession(secret);
      persistAdminAccess(session.accessToken, session.expiresAt);
      state.isAuthorized = true;
      applyAccessState();
      dom.authForm.elements.adminSecret.value = "";
      setStatus(dom.authStatus, "관리자 패널을 열었습니다.", "success");
      await loadRequests();
    } catch (error) {
      lockSurface(error.message || "관리자 인증에 실패했습니다.");
    }
  });

  dom.authClear?.addEventListener("click", () => {
    lockSurface("관리자 세션을 초기화했습니다.");
  });

  dom.refresh?.addEventListener("click", () => {
    void loadRequests();
  });

  dom.statusFilter?.addEventListener("change", () => {
    renderRequestList();
  });

  dom.requestList?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-repair-id]");
    if (!card) return;
    state.selectedId = card.dataset.repairId || "";
    renderRequestList();
    renderSelectedRequest();
    setStatus(dom.formStatus, "");
  });

  dom.form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveRequest();
  });

  window.addEventListener("pagehide", clearImageUrls);
}

export function initRepairAdmin() {
  if (!dom.authForm) return;
  bindEvents();
  applyAccessState();
  renderRequestList();
  renderSelectedRequest();

  if (!state.accessToken) return;
  requestAdmin("/api/orders/admin-session")
    .then(() => {
      state.isAuthorized = true;
      applyAccessState();
      return loadRequests();
    })
    .catch(() => {
      lockSurface("관리자 인증이 필요합니다.");
    });
}

initRepairAdmin();