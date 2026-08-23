import { readAverageRgbFromFile } from "./utils/image-colors-20260818-01.js";

const ADMIN_ACCESS_TOKEN_KEY = "studiooalum:order-admin-access-token";
const ADMIN_ACCESS_EXPIRES_AT_KEY = "studiooalum:order-admin-access-expires-at";

const dom = {
  authForm: document.querySelector(".js-repair-admin-auth-form"),
  authClear: document.querySelector(".js-repair-admin-auth-clear"),
  authStatus: document.querySelector(".js-repair-admin-auth-status"),
  authGuards: Array.from(document.querySelectorAll("[data-repair-admin-auth-guard]")),
  refresh: document.querySelector(".js-repair-admin-refresh"),
  processNotifications: document.querySelector(".js-repair-notification-process"),
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
  readOnly: document.querySelector(".js-repair-admin-readonly"),
  previewButton: document.querySelector(".js-repair-notification-preview"),
  preview: document.querySelector(".js-repair-admin-preview"),
  inquiries: document.querySelector(".js-repair-admin-inquiries"),
  notifications: document.querySelector(".js-repair-admin-notifications"),
  imageCount: document.querySelector(".js-repair-admin-image-count"),
  imageList: document.querySelector(".js-repair-admin-image-list"),
  save: document.querySelector(".js-repair-admin-save"),
  formStatus: document.querySelector(".js-repair-admin-form-status"),
  galleryForm: document.querySelector(".js-repair-gallery-upload-form"),
  galleryUpload: document.querySelector(".js-repair-gallery-upload"),
  galleryStatus: document.querySelector(".js-repair-gallery-status"),
  galleryList: document.querySelector(".js-repair-gallery-list"),
};

const state = {
  accessToken: sessionStorage.getItem(ADMIN_ACCESS_TOKEN_KEY) || "",
  accessExpiresAt: sessionStorage.getItem(ADMIN_ACCESS_EXPIRES_AT_KEY) || "",
  isAuthorized: false,
  requests: [],
  selectedId: "",
  imageUrls: [],
  gallery: [],
};

const STATUS_LABELS = {
  received: "신청 완료",
  item_received: "수선제품 수신 완료",
  in_progress: "수선 진행 중",
  payment_pending: "수선 완료 · 가격 및 입금 안내",
  shipping: "입금 완료 · 배송 중",
  closed: "배송 완료 · Archive",
  rejected: "진행 불가",
  cancelled: "취소",
};

const NOTIFICATION_STATUS_LABELS = {
  pending: "발송 대기",
  processing: "발송 처리 중",
  sent: "발송 완료",
  failed: "발송 실패",
  unknown: "전달 여부 확인 필요",
  dead_letter: "재시도 종료",
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

function formatDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIsoDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
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

function getFormRequestPayload(request) {
  const rawQuoteAmount = String(dom.form?.elements.quoteAmount.value || "").trim();
  const rawFinalAmount = String(dom.form?.elements.finalAmount.value || "").trim();
  return {
    id: request.id,
    expectedVersion: Number(request.version || dom.form?.elements.expectedVersion.value || 1),
    status: dom.form.elements.status.value,
    quoteAmount: rawQuoteAmount ? Number(rawQuoteAmount) : null,
    finalAmount: rawFinalAmount ? Number(rawFinalAmount) : null,
    bankAccount: String(dom.form.elements.bankAccount.value || "").trim(),
    paymentInstructions: String(dom.form.elements.paymentInstructions.value || "").trim(),
    paymentConfirmedAt: toIsoDateTime(dom.form.elements.paymentConfirmedAt.value),
    carrier: String(dom.form.elements.carrier.value || "").trim(),
    trackingNumber: String(dom.form.elements.trackingNumber.value || "").trim(),
    trackingUrl: String(dom.form.elements.trackingUrl.value || "").trim(),
    customerMessage: String(dom.form.elements.customerMessage.value || "").trim(),
    adminNote: String(dom.form.elements.adminNote.value || "").trim(),
  };
}

function updateStatusFields() {
  if (!dom.form) return;
  const status = String(dom.form.elements.status.value || "received");
  document.querySelectorAll("[data-repair-payment-field]").forEach((field) => {
    field.hidden = !["payment_pending", "shipping", "closed"].includes(status);
  });
  document.querySelectorAll("[data-repair-shipping-field]").forEach((field) => {
    field.hidden = !["shipping", "closed"].includes(status);
  });
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
    headers: getAuthHeaders(body !== undefined && !(body instanceof FormData)),
    body: body instanceof FormData ? body : (body === undefined ? undefined : JSON.stringify(body)),
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

function renderGallery() {
  if (!dom.galleryList) return;
  if (!state.gallery.length) {
    dom.galleryList.innerHTML = '<div class="fulfillment-empty">등록된 수선 작업 사진이 없습니다.</div>';
    return;
  }
  dom.galleryList.innerHTML = state.gallery.map((image) => `
    <article class="repair-admin-gallery-card">
      <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.filename || "수선 작업")}">
      <p>${(image.methods || []).map((method) => escapeHtml(method.toUpperCase())).join(" / ")}</p>
      <button type="button" class="fulfillment-btn fulfillment-btn--secondary" data-repair-gallery-delete="${escapeHtml(image.id)}">삭제</button>
    </article>
  `).join("");
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
  const archiveConsent = request.archiveConsentAt ? "동의함" : "미동의";
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
      <div><dt>작업 이미지 기록 활용</dt><dd>${escapeHtml(archiveConsent)}</dd></div>
      <div><dt>개인정보 수집 동의</dt><dd>${escapeHtml(privacyConsent)}</dd></div>
    </dl>
  `;
}

function renderNotificationPreview(preview, automaticNotification) {
  if (!dom.preview) return;
  if (!automaticNotification || !preview) {
    dom.preview.innerHTML = '<p class="fulfillment-empty">현재 상태와 같거나 자동 안내 대상이 아닌 상태입니다. 저장해도 이메일이 생성되지 않습니다.</p>';
    return;
  }
  dom.preview.innerHTML = `
    <p class="repair-admin-preview__subject"><strong>제목</strong><span>${escapeHtml(preview.subject || "")}</span></p>
    <pre>${escapeHtml(preview.bodyText || "")}</pre>
  `;
}

function renderInquiries(request) {
  if (!dom.inquiries) return;
  const inquiries = Array.isArray(request?.inquiries) ? request.inquiries : [];
  if (!inquiries.length) {
    dom.inquiries.innerHTML = '<div class="fulfillment-empty">등록된 고객 문의가 없습니다.</div>';
    return;
  }
  dom.inquiries.innerHTML = inquiries.map((inquiry) => `
    <article class="repair-admin-history-card">
      <div class="repair-admin-history-card__head">
        <strong>고객 문의</strong>
        <span>${escapeHtml(formatDate(inquiry.createdAt))}</span>
      </div>
      <p>${escapeHtml(inquiry.message || "")}</p>
    </article>
  `).join("");
}

function renderNotifications(request) {
  if (!dom.notifications) return;
  const notifications = Array.isArray(request?.notifications) ? request.notifications : [];
  if (!notifications.length) {
    dom.notifications.innerHTML = '<div class="fulfillment-empty">저장된 안내 발송 기록이 없습니다.</div>';
    return;
  }
  dom.notifications.innerHTML = notifications.map((notification) => {
    const status = String(notification.status || "pending");
    const canResend = !request.isReadOnly && !["pending", "processing"].includes(status);
    const actionLabel = status === "sent" ? "다시 보내기" : "재발송";
    return `
      <article class="repair-admin-history-card">
        <div class="repair-admin-history-card__head">
          <strong>${escapeHtml(notification.subject || notification.eventType || "안내 이메일")}</strong>
          <span class="repair-admin-notification-state" data-status="${escapeHtml(status)}">${escapeHtml(NOTIFICATION_STATUS_LABELS[status] || status)}</span>
        </div>
        <p>${escapeHtml(notification.recipient || "")}</p>
        <p>생성 ${escapeHtml(formatDate(notification.createdAt))}${notification.sentAt ? ` · 발송 ${escapeHtml(formatDate(notification.sentAt))}` : ""} · 시도 ${Number(notification.attemptCount || 0)}회</p>
        ${notification.lastError ? `<p>실패 사유: ${escapeHtml(notification.lastError)}</p>` : ""}
        ${canResend ? `<div class="repair-admin-history-card__actions"><span></span><button type="button" class="fulfillment-btn fulfillment-btn--secondary fulfillment-btn--small" data-repair-notification-retry="${escapeHtml(notification.id)}">${actionLabel}</button></div>` : ""}
      </article>
    `;
  }).join("");
}

function setReadOnlyState(request) {
  if (!dom.form) return;
  const readOnly = Boolean(request?.isReadOnly);
  dom.form.classList.toggle("is-readonly", readOnly);
  if (dom.readOnly) dom.readOnly.hidden = !readOnly;
  Array.from(dom.form.elements).forEach((element) => {
    if (element.name === "id" || element.name === "expectedVersion") return;
    element.disabled = readOnly;
  });
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
  dom.form.elements.expectedVersion.value = String(request.version || 1);
  dom.form.elements.status.value = request.status || "received";
  dom.form.elements.quoteAmount.value = request.quoteAmount === null || request.quoteAmount === undefined ? "" : String(request.quoteAmount);
  dom.form.elements.finalAmount.value = request.finalAmount === null || request.finalAmount === undefined ? "" : String(request.finalAmount);
  dom.form.elements.bankAccount.value = request.bankAccount || "";
  dom.form.elements.paymentInstructions.value = request.paymentInstructions || "";
  dom.form.elements.paymentConfirmedAt.value = formatDateTimeLocal(request.paymentConfirmedAt);
  dom.form.elements.carrier.value = request.carrier || "";
  dom.form.elements.trackingNumber.value = request.trackingNumber || "";
  dom.form.elements.trackingUrl.value = request.trackingUrl || "";
  dom.form.elements.customerMessage.value = request.customerMessage || "";
  dom.form.elements.adminNote.value = request.adminNote || "";
  if (dom.requestNumber) dom.requestNumber.textContent = request.requestNumber || "";
  if (dom.title) dom.title.textContent = `${request.customerName || "수선"} · 수선 의뢰`;
  if (dom.createdAt) dom.createdAt.textContent = formatDate(request.createdAt);
  if (dom.imageCount) dom.imageCount.textContent = `${Number(request.images?.length || 0)}장`;
  if (dom.archiveCandidate) {
    dom.archiveCandidate.hidden = !request.isArchiveCandidate;
    dom.archiveCandidate.textContent = request.isArchiveCandidate
      ? "Archive 기록 후보: 공개 동의가 확인된 배송 완료 요청입니다. 공개 Archive에는 자동 게시되지 않습니다."
      : "";
  }
  updateStatusFields();
  setReadOnlyState(request);
  renderNotificationPreview(null, false);
  renderInquiries(request);
  renderNotifications(request);
  renderCustomerDetails(request);
  void renderPrivateImages(request);
}

function applySnapshot(payload) {
  state.requests = Array.isArray(payload?.requests) ? payload.requests : [];
  state.gallery = Array.isArray(payload?.gallery) ? payload.gallery : [];
  if (state.selectedId && !getSelectedRequest()) state.selectedId = "";
  renderGallery();
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
  if (!request || !dom.form || request.isReadOnly) return;

  const requestPayload = getFormRequestPayload(request);
  if (requestPayload.quoteAmount !== null && (!Number.isInteger(requestPayload.quoteAmount) || requestPayload.quoteAmount < 0)) {
    setStatus(dom.formStatus, "견적 금액을 다시 확인해주세요.", "error");
    dom.form.elements.quoteAmount.focus();
    return;
  }
  if (requestPayload.finalAmount !== null && (!Number.isInteger(requestPayload.finalAmount) || requestPayload.finalAmount < 0)) {
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
        request: requestPayload,
      },
    });
    applySnapshot(payload);
    renderRequestList();
    renderSelectedRequest();
    const notificationStatus = payload.operation?.notificationStatus;
    const message = payload.operation?.changed === false
      ? "변경 사항 없음 · 안내 발송 없음"
      : notificationStatus === "failed"
        ? "상태 저장 완료 · 안내 발송 실패"
        : notificationStatus === "pending"
          ? "상태 저장 완료 · 안내 발송 대기"
          : "상태 저장 완료 · 자동 안내 없음";
    setStatus(dom.formStatus, message, notificationStatus === "failed" ? "error" : "success");
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

async function previewNotification() {
  const request = getSelectedRequest();
  if (!request || !dom.form || request.isReadOnly) return;
  setButtonLoading(dom.previewButton, true, "확인 중...");
  try {
    const payload = await requestAdmin("/api/repairs/admin", {
      method: "POST",
      body: {
        action: "previewRepairNotification",
        request: getFormRequestPayload(request),
      },
    });
    renderNotificationPreview(payload.preview, payload.automaticNotification);
    setStatus(dom.formStatus, payload.automaticNotification
      ? "저장 시 이 내용이 안내 발송 대기열에 저장됩니다."
      : "같은 상태를 다시 저장해도 자동 안내는 발송되지 않습니다.");
  } catch (error) {
    renderNotificationPreview(null, false);
    setStatus(dom.formStatus, error.message || "안내 미리보기를 만들지 못했습니다.", "error");
  } finally {
    setButtonLoading(dom.previewButton, false, "확인 중...");
  }
}

async function processNotifications() {
  setButtonLoading(dom.processNotifications, true, "확인 중...");
  setStatus(dom.listStatus, "발송 대기열을 확인하는 중입니다.");
  try {
    const payload = await requestAdmin("/api/repairs/admin", {
      method: "POST",
      body: { action: "processRepairNotifications", limit: 25 },
    });
    applySnapshot(payload);
    renderRequestList();
    renderSelectedRequest();
    const processing = payload.processing || {};
    setStatus(dom.listStatus, `대기열 확인 완료 · 발송 ${Number(processing.sent || 0)}건 · 실패 ${Number(processing.failed || 0) + Number(processing.deadLetter || 0)}건`, "success");
  } catch (error) {
    setStatus(dom.listStatus, error.message || "발송 대기열을 확인하지 못했습니다.", "error");
  } finally {
    setButtonLoading(dom.processNotifications, false, "확인 중...");
  }
}

async function retryNotification(notificationId) {
  if (!notificationId || !window.confirm("이 안내를 새 발송 기록으로 다시 보낼까요?")) return;
  setStatus(dom.formStatus, "재발송 요청을 저장하는 중입니다.");
  try {
    const payload = await requestAdmin("/api/repairs/admin", {
      method: "POST",
      body: { action: "retryRepairNotification", notificationId },
    });
    applySnapshot(payload);
    renderRequestList();
    renderSelectedRequest();
    setStatus(dom.formStatus, "재발송 요청 저장 완료 · 안내 발송 대기", "success");
  } catch (error) {
    setStatus(dom.formStatus, error.message || "안내 재발송을 요청하지 못했습니다.", "error");
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

  dom.processNotifications?.addEventListener("click", () => {
    void processNotifications();
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

  dom.form?.elements.status?.addEventListener("change", () => {
    updateStatusFields();
    renderNotificationPreview(null, false);
    setStatus(dom.formStatus, "상태별 필수 항목을 입력한 뒤 안내 미리보기를 확인해주세요.");
  });

  dom.previewButton?.addEventListener("click", () => {
    void previewNotification();
  });

  dom.notifications?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-repair-notification-retry]");
    if (!button) return;
    void retryNotification(button.dataset.repairNotificationRetry || "");
  });

  dom.galleryForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(dom.galleryForm);
    formData.set("action", "uploadRepairGalleryImage");
    const averageRgb = await readAverageRgbFromFile(formData.get("file"));
    if (averageRgb) formData.set("imageColor", averageRgb);
    if (!formData.getAll("methods").length) {
      setStatus(dom.galleryStatus, "수선 방식을 하나 이상 선택해주세요.", "error");
      return;
    }
    setButtonLoading(dom.galleryUpload, true, "등록 중...");
    try {
      const payload = await requestAdmin("/api/repairs/admin", { method: "POST", body: formData });
      applySnapshot(payload);
      dom.galleryForm.reset();
      setStatus(dom.galleryStatus, "수선 작업 사진을 등록했습니다.", "success");
    } catch (error) {
      setStatus(dom.galleryStatus, error.message || "사진을 등록하지 못했습니다.", "error");
    } finally {
      setButtonLoading(dom.galleryUpload, false, "등록 중...");
    }
  });

  dom.galleryList?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-repair-gallery-delete]");
    if (!button || !window.confirm("이 수선 작업 사진을 삭제할까요?")) return;
    try {
      const payload = await requestAdmin("/api/repairs/admin", {
        method: "POST",
        body: { action: "deleteRepairGalleryImage", id: button.dataset.repairGalleryDelete },
      });
      applySnapshot(payload);
      setStatus(dom.galleryStatus, "사진을 삭제했습니다.", "success");
    } catch (error) {
      setStatus(dom.galleryStatus, error.message || "사진을 삭제하지 못했습니다.", "error");
    }
  });

  window.addEventListener("pagehide", clearImageUrls);
}

export function initRepairAdmin() {
  if (!dom.authForm) return;
  bindEvents();
  applyAccessState();
  renderRequestList();
  renderSelectedRequest();
  renderGallery();

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