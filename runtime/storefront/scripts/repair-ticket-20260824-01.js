import { prepareRepairPhotos, validateRepairPhotos } from "./repair-photo-upload.js";
import { lockBodyScroll, unlockBodyScroll } from "./utils/scroll-lock.js";

const ADMIN_TOKEN_KEY = "studiooalum:order-admin-access-token";
const GUEST_TOKEN_PREFIX = "studiooalum:repair-ticket-token:";
const SIGNED_TOKEN_PREFIX = "studiooalum:repair-ticket-signed-access:";
const MESSAGE_ID_PREFIX = "studiooalum:repair-ticket-message-id:";
const IMAGE_LIGHTBOX_SCROLL_LOCK_KEY = "repair-ticket-image-lightbox";

const params = new URLSearchParams(window.location.search);
const ticketId = String(params.get("ticket") || "").trim();
const adminMode = params.get("mode") === "admin";
const signedAccess = String(params.get("access") || "").trim();

const dom = {
  loading: document.querySelector(".js-repair-ticket-loading"),
  shell: document.querySelector(".js-repair-ticket-shell"),
  back: document.querySelector(".js-repair-ticket-back"),
  number: document.querySelector(".js-repair-ticket-number"),
  status: document.querySelector(".js-repair-ticket-status"),
  facts: document.querySelector(".js-repair-ticket-facts"),
  requestImages: document.querySelector(".js-repair-ticket-request-images"),
  requestImagesGrid: document.querySelector(".js-repair-ticket-request-images-grid"),
  messages: document.querySelector(".js-repair-ticket-messages"),
  refresh: document.querySelector(".js-repair-ticket-refresh"),
  form: document.querySelector(".js-repair-ticket-form"),
  fileList: document.querySelector(".js-repair-ticket-file-list"),
  submit: document.querySelector(".js-repair-ticket-submit"),
  formStatus: document.querySelector(".js-repair-ticket-form-status"),
};

const state = {
  ticket: null,
  viewerType: adminMode ? "admin" : "customer",
  files: [],
  objectUrls: [],
  clientMessageId: "",
  preparingPhotos: false,
  sending: false,
};

let imageLightboxEl = null;
let imageLightboxImageEl = null;
let imageLightboxPrevEl = null;
let imageLightboxNextEl = null;
let imageLightboxPreviouslyFocused = null;
let imageLightboxItems = [];
let imageLightboxActiveIndex = 0;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "-");
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatPrice(value) {
  return value === null || value === undefined || value === "" ? "미정" : `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function formatTicketNumber(repair) {
  const ticketNumber = Number(repair?.ticketNumber || 0);
  if (Number.isInteger(ticketNumber) && ticketNumber > 0) {
    return `#${String(ticketNumber).padStart(3, "0")}`;
  }
  return "수선 접수";
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""), window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function readGuestToken() {
  try {
    return sessionStorage.getItem(`${GUEST_TOKEN_PREFIX}${ticketId}`) || "";
  } catch {
    return "";
  }
}

function signedTicketToken() {
  try {
    if (signedAccess) {
      sessionStorage.setItem(`${SIGNED_TOKEN_PREFIX}${ticketId}`, signedAccess);
      const cleanUrl = `${window.location.pathname}?ticket=${encodeURIComponent(ticketId)}${adminMode ? "&mode=admin" : ""}`;
      window.history.replaceState({}, document.title, cleanUrl);
    }
    return signedAccess || sessionStorage.getItem(`${SIGNED_TOKEN_PREFIX}${ticketId}`) || "";
  } catch {
    return signedAccess;
  }
}

function readPendingMessageId() {
  try {
    return sessionStorage.getItem(`${MESSAGE_ID_PREFIX}${ticketId}`) || "";
  } catch {
    return "";
  }
}

function writePendingMessageId(value) {
  try {
    if (value) sessionStorage.setItem(`${MESSAGE_ID_PREFIX}${ticketId}`, value);
    else sessionStorage.removeItem(`${MESSAGE_ID_PREFIX}${ticketId}`);
  } catch {}
}

function authHeaders() {
  const headers = { Accept: "application/json" };
  if (adminMode) {
    const token = sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
    if (token) headers.Authorization = `Bearer ${token}`;
  } else {
    const token = readGuestToken();
    if (token) headers["X-Guest-Access-Token"] = token;
    const signedToken = signedTicketToken();
    if (signedToken) headers["X-Repair-Ticket-Access"] = signedToken;
  }
  return headers;
}

function setFormStatus(message = "", type = "") {
  if (!dom.formStatus) return;
  dom.formStatus.textContent = message;
  dom.formStatus.classList.toggle("is-error", type === "error");
  dom.formStatus.classList.toggle("is-success", type === "success");
}

function clearObjectUrls() {
  closeImageLightbox();
  state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.objectUrls = [];
}

function normalizeImageLightboxIndex(index) {
  if (!imageLightboxItems.length) return 0;
  return (index + imageLightboxItems.length) % imageLightboxItems.length;
}

function updateImageLightbox() {
  if (!imageLightboxImageEl || !imageLightboxItems.length) return;
  const image = imageLightboxItems[imageLightboxActiveIndex];
  imageLightboxImageEl.src = image.url;
  imageLightboxImageEl.alt = image.alt || "첨부 이미지 원본";
  const hasMultipleImages = imageLightboxItems.length > 1;
  imageLightboxPrevEl?.toggleAttribute("hidden", !hasMultipleImages);
  imageLightboxNextEl?.toggleAttribute("hidden", !hasMultipleImages);
}

function stepImageLightbox(offset) {
  if (imageLightboxItems.length < 2) return;
  imageLightboxActiveIndex = normalizeImageLightboxIndex(imageLightboxActiveIndex + offset);
  updateImageLightbox();
}

function closeImageLightbox() {
  if (!imageLightboxEl?.classList.contains("is-open")) return;
  imageLightboxEl.classList.remove("is-open");
  imageLightboxEl.setAttribute("aria-hidden", "true");
  document.body.classList.remove("repair-ticket-image-lightbox-open");
  unlockBodyScroll(IMAGE_LIGHTBOX_SCROLL_LOCK_KEY);
  if (imageLightboxPreviouslyFocused?.isConnected) imageLightboxPreviouslyFocused.focus();
  imageLightboxPreviouslyFocused = null;
}

function ensureImageLightbox() {
  if (imageLightboxEl) return;
  imageLightboxEl = document.createElement("div");
  imageLightboxEl.className = "repair-ticket-image-lightbox";
  imageLightboxEl.setAttribute("aria-hidden", "true");
  imageLightboxEl.innerHTML = `
    <div class="repair-ticket-image-lightbox__backdrop" data-ticket-lightbox-close="true"></div>
    <div class="repair-ticket-image-lightbox__dialog" role="dialog" aria-modal="true" aria-label="첨부 이미지 원본 보기">
      <button type="button" class="repair-ticket-image-lightbox__nav repair-ticket-image-lightbox__nav--prev" aria-label="이전 이미지"><span aria-hidden="true">&lt;</span></button>
      <div class="repair-ticket-image-lightbox__viewport">
        <figure class="repair-ticket-image-lightbox__figure"><img class="repair-ticket-image-lightbox__image" alt=""></figure>
      </div>
      <button type="button" class="repair-ticket-image-lightbox__nav repair-ticket-image-lightbox__nav--next" aria-label="다음 이미지"><span aria-hidden="true">&gt;</span></button>
      <button type="button" class="repair-ticket-image-lightbox__close" aria-label="원본 이미지 닫기"></button>
    </div>`;
  document.body.appendChild(imageLightboxEl);
  imageLightboxImageEl = imageLightboxEl.querySelector(".repair-ticket-image-lightbox__image");
  imageLightboxPrevEl = imageLightboxEl.querySelector(".repair-ticket-image-lightbox__nav--prev");
  imageLightboxNextEl = imageLightboxEl.querySelector(".repair-ticket-image-lightbox__nav--next");
  imageLightboxPrevEl?.addEventListener("click", () => stepImageLightbox(-1));
  imageLightboxNextEl?.addEventListener("click", () => stepImageLightbox(1));
  imageLightboxEl.querySelector(".repair-ticket-image-lightbox__close")?.addEventListener("click", closeImageLightbox);
  imageLightboxEl.addEventListener("click", (event) => {
    if (event.target.closest(".repair-ticket-image-lightbox__image, .repair-ticket-image-lightbox__nav, .repair-ticket-image-lightbox__close")) return;
    if (event.target.closest("[data-ticket-lightbox-close], .repair-ticket-image-lightbox__viewport, .repair-ticket-image-lightbox__figure")) closeImageLightbox();
  });
}

function openImageLightbox(trigger) {
  const group = trigger.closest(".repair-ticket-message__attachments, .repair-ticket-request-images__grid");
  if (!group) return;
  const buttons = Array.from(group.querySelectorAll("[data-ticket-image-open]"));
  imageLightboxItems = buttons.map((button) => {
    const image = button.querySelector("img");
    return { url: image?.currentSrc || image?.src || "", alt: image?.alt || "첨부 이미지 원본" };
  }).filter((image) => image.url);
  const activeIndex = buttons.indexOf(trigger);
  if (!imageLightboxItems.length || activeIndex < 0) return;
  ensureImageLightbox();
  imageLightboxPreviouslyFocused = trigger;
  imageLightboxActiveIndex = normalizeImageLightboxIndex(activeIndex);
  updateImageLightbox();
  imageLightboxEl.classList.add("is-open");
  imageLightboxEl.setAttribute("aria-hidden", "false");
  document.body.classList.add("repair-ticket-image-lightbox-open");
  lockBodyScroll(IMAGE_LIGHTBOX_SCROLL_LOCK_KEY);
  requestAnimationFrame(() => imageLightboxEl.querySelector(".repair-ticket-image-lightbox__close")?.focus());
}

async function fetchTicket() {
  const response = await fetch(`/api/repairs/tickets/${encodeURIComponent(ticketId)}`, {
    headers: authHeaders(),
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw Object.assign(new Error(payload?.error || "Repair Ticket을 불러오지 못했습니다."), { status: response.status });
  state.ticket = payload.ticket;
  state.viewerType = payload.viewerType || state.viewerType;
  return payload.ticket;
}

function renderFacts(ticket) {
  const repair = ticket.repair || {};
  const trackingNumber = String(repair.trackingNumber || "").trim();
  const shippingText = [repair.carrier, trackingNumber].filter(Boolean).join(" · ");
  const facts = [
    ["조회 번호", repair.requestNumber || "-"],
    ["신청자", repair.customerName || "-"],
    ["제품", repair.itemType || "-"],
    ["신청 내용", repair.issueDescription || "-"],
    ["예상 가격", formatPrice(repair.quoteAmount)],
    ["최종 가격", formatPrice(repair.finalAmount)],
    ["입금 안내", [repair.bankAccount, repair.paymentInstructions].filter(Boolean).join("\n") || "미정"],
    ["Ticket 생성일", formatDate(ticket.createdAt)],
    ["Ticket 종료일", ticket.closedAt ? formatDate(ticket.closedAt) : "진행 중"],
    ["운송장 번호", trackingNumber ? shippingText : "배송 전"],
  ];
  dom.facts.innerHTML = facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
}

async function loadProtectedImages() {
  const images = Array.from(document.querySelectorAll("img[data-protected-image-path]"));
  await Promise.all(images.map(async (image) => {
    const response = await fetch(image.dataset.protectedImagePath, { headers: authHeaders(), credentials: "same-origin" });
    if (!response.ok) return;
    const objectUrl = URL.createObjectURL(await response.blob());
    state.objectUrls.push(objectUrl);
    image.src = objectUrl;
  }));
}

function renderRequestImages(ticket) {
  if (!dom.requestImages || !dom.requestImagesGrid) return;
  const images = Array.isArray(ticket.repair?.requestImages) ? ticket.repair.requestImages : [];
  dom.requestImages.hidden = images.length === 0;
  dom.requestImagesGrid.innerHTML = images.map((image) => `
    <button type="button" class="repair-ticket-image-button" data-ticket-image-open aria-label="${escapeHtml(image.filename || "수선 신청 사진")} 원본 보기">
      <img alt="${escapeHtml(image.filename || "수선 신청 사진")}" data-protected-image-path="${escapeHtml(image.streamPath)}">
    </button>
  `).join("");
}

function renderMessages(ticket) {
  const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
  if (!messages.length) {
    dom.messages.innerHTML = '<div class="repair-ticket-empty">아직 등록된 메시지가 없습니다.</div>';
    return;
  }
  const labels = { customer: "고객", admin: "Studio OALUM", system: "상태 안내" };
  dom.messages.innerHTML = messages.map((message) => {
    const canDelete = message.authorType === state.viewerType && message.authorType !== "system";
    const body = message.authorType === "system" && String(message.body || "").startsWith("수선 접수가 완료")
      ? "수선 접수가 완료 되었습니다. 확인 후 진행 방향과 예상 가격을 안내 드립니다.\n\n오알룸 배송지\n(02412)서울특별시 동대문구 이문로42길 5 201호\n010-4746-5999"
      : message.body || "";
    return `
    <article class="repair-ticket-message repair-ticket-message--${escapeHtml(message.authorType)}">
      <div class="repair-ticket-message__meta">
        <span class="repair-ticket-message__author">${escapeHtml(labels[message.authorType] || message.authorType)}</span>
        <span class="repair-ticket-message__meta-actions">
          <time>${escapeHtml(formatDate(message.createdAt))}</time>
          ${canDelete ? `<button type="button" class="repair-ticket-message__delete" data-message-delete="${escapeHtml(message.id)}" aria-label="메시지 삭제">×</button>` : ""}
        </span>
      </div>
      <p class="repair-ticket-message__body">${escapeHtml(body)}</p>
      ${(message.attachments || []).length ? `<div class="repair-ticket-message__attachments">${message.attachments.map((attachment) => `<button type="button" class="repair-ticket-image-button" data-ticket-image-open aria-label="${escapeHtml(attachment.filename || "첨부 이미지")} 원본 보기"><img alt="${escapeHtml(attachment.filename || "첨부 이미지")}" data-protected-image-path="${escapeHtml(attachment.streamPath)}"></button>`).join("")}</div>` : ""}
    </article>
  `;
  }).join("");
}

async function deleteMessage(messageId) {
  if (!messageId || !window.confirm("이 메시지를 삭제할까요?")) return;
  setFormStatus("메시지를 삭제하는 중입니다.");
  try {
    const response = await fetch(`/api/repairs/tickets/${encodeURIComponent(ticketId)}`, {
      method: "DELETE",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ messageId }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || "메시지를 삭제하지 못했습니다.");
    state.ticket = payload.ticket;
    renderTicket();
    setFormStatus("메시지를 삭제했습니다.", "success");
  } catch (error) {
    setFormStatus(error.message || "메시지를 삭제하지 못했습니다.", "error");
  }
}

function renderTicket() {
  const ticket = state.ticket;
  if (!ticket) return;
  const repair = ticket.repair || {};
  clearObjectUrls();
  dom.number.textContent = formatTicketNumber(repair);
  dom.status.textContent = repair.statusLabel || repair.status || "";
  renderFacts(ticket);
  renderRequestImages(ticket);
  renderMessages(ticket);
  void loadProtectedImages();
  const closed = ticket.status === "closed";
  dom.form.hidden = closed;
  if (adminMode) dom.back.href = "./repair-admin.html";
  dom.shell.hidden = false;
  dom.loading.hidden = true;
}

function renderFileList() {
  dom.fileList.innerHTML = state.files.map((file) => `<span>${escapeHtml(file.name)} · ${Math.max(1, Math.round(file.size / 1024))}KB</span>`).join("");
}

function setLoading(loading) {
  state.sending = loading;
  dom.submit.disabled = loading;
  dom.form.elements.attachments.disabled = loading;
  dom.submit.textContent = loading ? "전송 중..." : "메시지 보내기";
}

async function submitMessage() {
  if (state.preparingPhotos || state.sending) return;
  const body = String(dom.form.elements.body.value || "").trim();
  if (!body) {
    setFormStatus("메시지 내용을 입력해주세요.", "error");
    dom.form.elements.body.focus();
    return;
  }
  if (!state.clientMessageId) state.clientMessageId = readPendingMessageId() || `ticket:${crypto.randomUUID()}`;
  writePendingMessageId(state.clientMessageId);
  const formData = new FormData();
  formData.set("body", body);
  formData.set("client_message_id", state.clientMessageId);
  state.files.forEach((file) => formData.append("attachments", file));
  setLoading(true);
  setFormStatus("메시지를 등록하는 중입니다.");
  try {
    const response = await fetch(`/api/repairs/tickets/${encodeURIComponent(ticketId)}`, {
      method: "POST",
      headers: { ...authHeaders(), "Idempotency-Key": state.clientMessageId },
      body: formData,
      credentials: "same-origin",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || "메시지를 등록하지 못했습니다.");
    state.ticket = payload.ticket;
    state.clientMessageId = "";
    writePendingMessageId("");
    state.files = [];
    dom.form.reset();
    renderFileList();
    renderTicket();
    setFormStatus("메시지를 등록했습니다.", "success");
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  } catch (error) {
    setFormStatus(error.message || "메시지를 등록하지 못했습니다.", "error");
  } finally {
    setLoading(false);
  }
}

async function load() {
  if (!ticketId) {
    dom.loading.textContent = "Repair Ticket 주소를 다시 확인해주세요.";
    return;
  }
  try {
    await fetchTicket();
    renderTicket();
  } catch (error) {
    dom.loading.textContent = error.message || "Repair Ticket을 불러오지 못했습니다.";
  }
}

dom.form?.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitMessage();
});

dom.messages?.addEventListener("click", (event) => {
  const imageButton = event.target.closest("[data-ticket-image-open]");
  if (imageButton) {
    openImageLightbox(imageButton);
    return;
  }
  const button = event.target.closest("[data-message-delete]");
  if (button) void deleteMessage(button.dataset.messageDelete);
});

dom.requestImagesGrid?.addEventListener("click", (event) => {
  const imageButton = event.target.closest("[data-ticket-image-open]");
  if (imageButton) openImageLightbox(imageButton);
});

window.addEventListener("keydown", (event) => {
  if (!imageLightboxEl?.classList.contains("is-open")) return;
  if (event.key === "Escape") closeImageLightbox();
  if (event.key === "ArrowLeft") stepImageLightbox(-1);
  if (event.key === "ArrowRight") stepImageLightbox(1);
});

dom.form?.elements.attachments?.addEventListener("change", async () => {
  const files = Array.from(dom.form.elements.attachments.files || []);
  // Clear old selections so a failed conversion cannot send previous photos.
  state.files = [];
  renderFileList();
  try {
    validateRepairPhotos(files);
    state.preparingPhotos = true;
    dom.submit.disabled = true;
    dom.form.elements.attachments.disabled = true;
    state.files = await prepareRepairPhotos(files, (current, total) => {
      setFormStatus(`사진을 준비하는 중입니다. ${current}/${total}`);
    });
    renderFileList();
    setFormStatus(files.length ? `사진 ${files.length}장을 준비했습니다.` : "");
  } catch (error) {
    setFormStatus(error.message || "사진을 처리하지 못했습니다.", "error");
  } finally {
    dom.form.elements.attachments.value = "";
    dom.form.elements.attachments.disabled = false;
    state.preparingPhotos = false;
    dom.submit.disabled = false;
  }
});

dom.refresh?.addEventListener("click", () => void load());
window.addEventListener("pagehide", clearObjectUrls);
void load();
