const ADMIN_TOKEN_KEY = "studiooalum:order-admin-access-token";
const GUEST_TOKEN_PREFIX = "studiooalum:repair-ticket-token:";
const SIGNED_TOKEN_PREFIX = "studiooalum:repair-ticket-signed-access:";
const MESSAGE_ID_PREFIX = "studiooalum:repair-ticket-message-id:";
const MAX_FILES = 4;
const MAX_FILE_SIZE = 8 * 1024 * 1024;

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
  closed: document.querySelector(".js-repair-ticket-closed"),
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
  state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.objectUrls = [];
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
  const trackingUrl = safeUrl(repair.trackingUrl);
  const shippingText = [repair.carrier, repair.trackingNumber].filter(Boolean).join(" · ");
  const facts = [
    ["수선 접수 조회번호", repair.requestNumber || "-"],
    ["신청자", repair.customerName || "-"],
    ["제품", repair.itemType || "-"],
    ["신청 내용", repair.issueDescription || "-"],
    ["예상 가격", formatPrice(repair.quoteAmount)],
    ["최종 가격", formatPrice(repair.finalAmount)],
    ["입금 안내", [repair.bankAccount, repair.paymentInstructions].filter(Boolean).join("\n") || "미정"],
    ...(shippingText ? [["배송", shippingText]] : []),
    ["신청일", formatDate(repair.createdAt)],
    ["최근 업데이트", formatDate(repair.updatedAt)],
    ["Ticket 생성일", formatDate(ticket.createdAt)],
    ["Ticket 종료일", ticket.closedAt ? formatDate(ticket.closedAt) : "진행 중"],
  ];
  dom.facts.innerHTML = facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")
    + (trackingUrl ? `<div><dt>배송 조회</dt><dd><a href="${escapeHtml(trackingUrl)}" target="_blank" rel="noreferrer">배송 조회 열기</a></dd></div>` : "");
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
    <img alt="${escapeHtml(image.filename || "수선 신청 사진")}" data-protected-image-path="${escapeHtml(image.streamPath)}">
  `).join("");
}

function renderMessages(ticket) {
  const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
  if (!messages.length) {
    dom.messages.innerHTML = '<div class="repair-ticket-empty">아직 등록된 메시지가 없습니다.</div>';
    return;
  }
  const labels = { customer: "고객", admin: "Studio OALUM", system: "상태 안내" };
  dom.messages.innerHTML = messages.map((message) => `
    <article class="repair-ticket-message repair-ticket-message--${escapeHtml(message.authorType)}">
      <div class="repair-ticket-message__meta">
        <span class="repair-ticket-message__author">${escapeHtml(labels[message.authorType] || message.authorType)}</span>
        <time>${escapeHtml(formatDate(message.createdAt))}</time>
      </div>
      <p class="repair-ticket-message__body">${escapeHtml(message.body || "")}</p>
      ${(message.attachments || []).length ? `<div class="repair-ticket-message__attachments">${message.attachments.map((attachment) => `<img alt="${escapeHtml(attachment.filename || "첨부 이미지")}" data-protected-image-path="${escapeHtml(attachment.streamPath)}">`).join("")}</div>` : ""}
    </article>
  `).join("");
}

function renderTicket() {
  const ticket = state.ticket;
  if (!ticket) return;
  const repair = ticket.repair || {};
  clearObjectUrls();
  dom.number.textContent = formatTicketNumber(repair);
  dom.status.textContent = repair.statusLabel || repair.status || "";
  renderFacts(ticket);
  renderPayment(repair);
  renderRequestImages(ticket);
  renderMessages(ticket);
  void loadProtectedImages();
  const closed = ticket.status === "closed";
  dom.closed.hidden = !closed;
  dom.form.hidden = closed;
  if (adminMode) dom.back.href = "./repair-admin.html";
  dom.shell.hidden = false;
  dom.loading.hidden = true;
}

function renderPayment(repair) {
  const section = document.getElementById("repairTicketPayment");
  const button = document.getElementById("repairTicketPayButton");
  const status = document.getElementById("repairTicketPaymentStatus");
  const paid = Boolean(repair.paymentConfirmedAt);
  section.hidden = !repair.onlinePaymentAvailable && !paid;
  document.getElementById("repairTicketPaymentAmount").textContent = formatPrice(repair.finalAmount);
  button.hidden = !repair.onlinePaymentAvailable || adminMode;
  button.disabled = repair.paymentStatus === "processing";
  status.textContent = paid ? `결제 완료 · ${formatDate(repair.paymentConfirmedAt)}` : repair.paymentStatus === "processing" ? "결제 확인 중입니다. 잠시 후 새로고침해주세요." : "";
}

async function requestRepairPayment(action, values = {}) {
  const response = await fetch("/api/repairs/payment", {
    method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
    credentials: "same-origin", body: JSON.stringify({ action, ticketId, ...values }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "결제 요청을 처리하지 못했습니다.");
  return result;
}

let repairWidgets = null;
let repairCheckout = null;

async function openRepairPayment() {
  const dialog = document.getElementById("repairPaymentDialog");
  const button = document.getElementById("repairTicketPayButton");
  button.disabled = true;
  try {
    const result = await requestRepairPayment("checkout");
    repairCheckout = result.checkout;
    if (!window.TossPayments) throw new Error("결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.");
    dialog.showModal();
    if (!repairWidgets) {
      repairWidgets = window.TossPayments(repairCheckout.clientKey).widgets({ customerKey: window.TossPayments.ANONYMOUS });
      await repairWidgets.setAmount({ currency: repairCheckout.currency, value: repairCheckout.amount });
      await Promise.all([
        repairWidgets.renderPaymentMethods({ selector: "#repair-payment-method", variantKey: repairCheckout.paymentVariantKey }),
        repairWidgets.renderAgreement({ selector: "#repair-payment-agreement", variantKey: repairCheckout.agreementVariantKey }),
      ]);
    } else await repairWidgets.setAmount({ currency: repairCheckout.currency, value: repairCheckout.amount });
    document.getElementById("repairPaymentConfirm").disabled = false;
  } catch (error) { document.getElementById("repairTicketPaymentStatus").textContent = error.message; }
  finally { button.disabled = false; }
}

async function confirmReturnedRepairPayment() {
  if (params.get("paymentKey")) {
    await requestRepairPayment("confirm", { paymentKey: params.get("paymentKey"), orderId: params.get("orderId"), amount: Number(params.get("amount")) });
    window.history.replaceState({}, "", `${window.location.pathname}?ticket=${encodeURIComponent(ticketId)}`);
  } else if (params.get("code")) {
    document.getElementById("repairPaymentDialogStatus").textContent = params.get("message") || "결제가 완료되지 않았습니다.";
  }
}

function renderFileList() {
  dom.fileList.innerHTML = state.files.map((file) => `<span>${escapeHtml(file.name)} · ${Math.max(1, Math.round(file.size / 1024))}KB</span>`).join("");
}

function setLoading(loading) {
  dom.submit.disabled = loading;
  dom.submit.textContent = loading ? "전송 중..." : "메시지 보내기";
}

async function submitMessage() {
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
    await confirmReturnedRepairPayment();
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

dom.form?.elements.attachments?.addEventListener("change", () => {
  const files = Array.from(dom.form.elements.attachments.files || []);
  if (files.length > MAX_FILES || files.some((file) => file.size > MAX_FILE_SIZE)) {
    setFormStatus("사진은 최대 4장, 장당 8MB까지 첨부할 수 있습니다.", "error");
    dom.form.elements.attachments.value = "";
    return;
  }
  state.files = files;
  renderFileList();
  setFormStatus("");
});

dom.refresh?.addEventListener("click", () => void load());
document.getElementById("repairTicketPayButton")?.addEventListener("click", () => void openRepairPayment());
document.getElementById("repairPaymentClose")?.addEventListener("click", () => document.getElementById("repairPaymentDialog").close());
document.getElementById("repairPaymentConfirm")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const returnUrl = new URL("./repair-ticket", window.location.href);
    returnUrl.searchParams.set("ticket", ticketId);
    await repairWidgets.requestPayment({ orderId: repairCheckout.orderId, orderName: repairCheckout.orderName,
      successUrl: returnUrl.href, failUrl: returnUrl.href, customerEmail: repairCheckout.customer.email, customerName: repairCheckout.customer.name });
  } catch (error) {
    document.getElementById("repairPaymentDialogStatus").textContent = error.message || "결제가 완료되지 않았습니다.";
    button.disabled = false;
  }
});
window.addEventListener("pagehide", clearObjectUrls);
void load();
