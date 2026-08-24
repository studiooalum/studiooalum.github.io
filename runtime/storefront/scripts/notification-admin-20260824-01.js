const TOKEN_KEY = "studiooalum:order-admin-access-token";
const EXPIRES_KEY = "studiooalum:order-admin-access-expires-at";

const dom = {
  authForm: document.querySelector(".js-notification-auth-form"),
  authStatus: document.querySelector(".js-notification-auth-status"),
  authGuards: Array.from(document.querySelectorAll("[data-notification-auth-guard]")),
  areaFilter: document.querySelector(".js-notification-area-filter"),
  channelFilter: document.querySelector(".js-notification-channel-filter"),
  enabledFilter: document.querySelector(".js-notification-enabled-filter"),
  list: document.querySelector(".js-notification-template-list"),
  editorEmpty: document.querySelector(".js-notification-editor-empty"),
  editor: document.querySelector(".js-notification-editor"),
  editorArea: document.querySelector(".js-notification-editor-area"),
  editorTitle: document.querySelector(".js-notification-editor-title"),
  editorDescription: document.querySelector(".js-notification-editor-description"),
  subjectField: document.querySelector(".js-notification-subject-field"),
  variables: document.querySelector(".js-notification-variable-list"),
  preview: document.querySelector(".js-notification-preview"),
  previewButton: document.querySelector(".js-notification-preview-action"),
  save: document.querySelector(".js-notification-save"),
  test: document.querySelector(".js-notification-test"),
  activate: document.querySelector(".js-notification-activate"),
  restore: document.querySelector(".js-notification-restore"),
  editorStatus: document.querySelector(".js-notification-editor-status"),
  updated: document.querySelector(".js-notification-editor-updated"),
  revisionList: document.querySelector(".js-notification-revision-list"),
  process: document.querySelector(".js-notification-process"),
  deliveryList: document.querySelector(".js-notification-delivery-list"),
  previewModes: Array.from(document.querySelectorAll("[data-preview-mode]")),
};

const state = {
  token: sessionStorage.getItem(TOKEN_KEY) || "",
  templates: [],
  outbox: [],
  revisions: [],
  variables: [],
  selectedKey: "",
  selectedChannel: "",
  previewMode: "mobile",
  focusedField: null,
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
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function setStatus(target, message = "", type = "") {
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("is-error", type === "error");
  target.classList.toggle("is-success", type === "success");
}

function setButtonLoading(button, loading, text) {
  if (!button) return;
  if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent || "";
  button.disabled = loading;
  button.textContent = loading ? text : button.dataset.defaultText;
}

function headers(json = false) {
  const result = { Accept: "application/json" };
  if (state.token) result.Authorization = `Bearer ${state.token}`;
  if (json) result["Content-Type"] = "application/json";
  return result;
}

async function requestAdmin({ method = "GET", body } = {}) {
  const response = await fetch("/api/notifications/admin", {
    method,
    headers: headers(body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw Object.assign(new Error(payload?.error || "요청을 처리하지 못했습니다."), { status: response.status, details: payload?.details });
  return payload;
}

async function createSession(secret) {
  const response = await fetch("/api/orders/admin-session", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ adminSecret: secret }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || "관리자 인증에 실패했습니다.");
  state.token = payload.accessToken;
  sessionStorage.setItem(TOKEN_KEY, state.token);
  if (payload.expiresAt) sessionStorage.setItem(EXPIRES_KEY, payload.expiresAt);
}

function applyAccess(unlocked) {
  dom.authGuards.forEach((element) => { element.hidden = !unlocked; });
}

function selectedTemplate() {
  return state.templates.find((template) => template.templateKey === state.selectedKey && template.channel === state.selectedChannel) || null;
}

function applyPayload(payload) {
  state.templates = Array.isArray(payload.templates) ? payload.templates : [];
  state.outbox = Array.isArray(payload.outbox) ? payload.outbox : [];
  state.revisions = Array.isArray(payload.revisions) ? payload.revisions : [];
  state.variables = Array.isArray(payload.variables) ? payload.variables : [];
  if (state.selectedKey && !selectedTemplate()) {
    state.selectedKey = "";
    state.selectedChannel = "";
  }
  renderList();
  renderEditor();
  renderDelivery();
}

function filteredTemplates() {
  return state.templates.filter((template) => {
    const area = dom.areaFilter.value;
    const channel = dom.channelFilter.value;
    const enabled = dom.enabledFilter.value;
    return (area === "all" || template.area === area)
      && (channel === "all" || template.channel === channel)
      && (enabled === "all" || (enabled === "enabled") === template.isEnabled);
  });
}

function renderList() {
  const templates = filteredTemplates();
  if (!templates.length) {
    dom.list.innerHTML = '<div class="fulfillment-empty">조건에 맞는 알림이 없습니다.</div>';
    return;
  }
  dom.list.innerHTML = templates.map((template) => {
    const active = template.templateKey === state.selectedKey && template.channel === state.selectedChannel ? " is-active" : "";
    return `<button type="button" class="notification-template-card${active}" data-template-key="${escapeHtml(template.templateKey)}" data-template-channel="${escapeHtml(template.channel)}">
      <div class="notification-template-card__head"><strong>${escapeHtml(template.name)}</strong><span class="notification-template-state">${template.isEnabled ? "활성" : "비활성"}</span></div>
      <p>${escapeHtml(template.area)} · ${template.channel === "email" ? "이메일" : "문자"}</p>
      <p>${escapeHtml(template.triggerLabel || "수동")}</p>
      <span>편집</span>
    </button>`;
  }).join("");
}

function renderVariables(template) {
  const allowed = new Set(template.allowedVariables || []);
  dom.variables.innerHTML = state.variables.filter((variable) => allowed.has(variable.key)).map((variable) => `<button type="button" data-variable-key="${escapeHtml(variable.key)}">${escapeHtml(variable.label)}</button>`).join("");
}

function renderEditor() {
  const template = selectedTemplate();
  dom.editorEmpty.hidden = Boolean(template);
  dom.editor.hidden = !template;
  if (!template) return;
  dom.editorArea.textContent = `${template.area} · ${template.channel === "email" ? "이메일" : "문자"} · ${template.triggerLabel}`;
  dom.editorTitle.textContent = template.name;
  dom.editorDescription.textContent = template.description;
  dom.editor.elements.subject.value = template.draftSubject || "";
  dom.editor.elements.body.value = template.draftBody || "";
  dom.editor.elements.isEnabled.checked = template.isEnabled;
  dom.subjectField.hidden = template.channel !== "email";
  dom.updated.textContent = `마지막 저장 ${formatDate(template.updatedAt)}${template.activatedAt ? ` · 마지막 활성화 ${formatDate(template.activatedAt)}` : ""}`;
  renderVariables(template);
  renderRevisions(template);
  renderPreview(null);
}

function renderRevisions(template) {
  const revisions = state.revisions
    .filter((revision) => revision.templateKey === template.templateKey && revision.channel === template.channel)
    .slice(0, 5);
  if (!revisions.length) {
    dom.revisionList.innerHTML = "";
    return;
  }
  const labels = { draft_saved: "초안 저장", activated: "활성화", default_restored: "기본값 복원", enabled: "활성", disabled: "비활성", manual_retry: "재시도" };
  dom.revisionList.innerHTML = `<strong>최근 수정 이력</strong>${revisions.map((revision) => `<p>${escapeHtml(labels[revision.action] || revision.action)} · ${escapeHtml(formatDate(revision.createdAt))}</p>`).join("")}`;
}

function renderPreview(preview) {
  dom.preview.dataset.mode = state.previewMode;
  if (!preview) {
    dom.preview.innerHTML = "<p>미리보기를 눌러주세요.</p>";
    return;
  }
  const subject = preview.subject ? `<h4>${escapeHtml(preview.subject)}</h4>` : "";
  const type = preview.messageType ? `<p>${escapeHtml(preview.messageType.type)} · ${Number(preview.messageType.byteLength)}byte</p>` : "";
  dom.preview.innerHTML = `${subject}<p>${escapeHtml(preview.body)}</p>${type}`;
}

function renderDelivery() {
  const visible = state.outbox.filter((item) => ["pending", "processing", "failed", "unknown", "dead_letter"].includes(item.status)).slice(0, 30);
  if (!visible.length) {
    dom.deliveryList.innerHTML = '<div class="fulfillment-empty">확인이 필요한 발송 기록이 없습니다.</div>';
    return;
  }
  dom.deliveryList.innerHTML = visible.map((item) => `
    <article class="notification-delivery-card">
      <div class="notification-delivery-card__head"><strong>${escapeHtml(item.templateKey)}</strong><span class="notification-delivery-card__state" data-state="${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></div>
      <p>${escapeHtml(item.channel)} · ${escapeHtml(item.recipient)} · 시도 ${Number(item.attempts || 0)}회</p>
      ${item.lastError ? `<p>${escapeHtml(item.lastError)}</p>` : ""}
      ${["failed", "unknown", "dead_letter"].includes(item.status) ? `<button type="button" class="fulfillment-btn fulfillment-btn--secondary" data-notification-retry="${escapeHtml(item.id)}">재시도</button>` : ""}
    </article>
  `).join("");
}

function editorPayload(action) {
  const template = selectedTemplate();
  return {
    action,
    templateKey: template.templateKey,
    channel: template.channel,
    subject: String(dom.editor.elements.subject.value || "").trim(),
    body: String(dom.editor.elements.body.value || "").trim(),
  };
}

async function actionRequest(action, button, loadingText) {
  const payload = editorPayload(action);
  setButtonLoading(button, true, loadingText);
  setStatus(dom.editorStatus, "요청을 처리하는 중입니다.");
  try {
    const result = await requestAdmin({ method: "POST", body: payload });
    if (result.templates) applyPayload(result);
    if (result.preview) renderPreview(result.preview);
    setStatus(dom.editorStatus, result.message || "처리했습니다.", "success");
  } catch (error) {
    setStatus(dom.editorStatus, error.message || "요청을 처리하지 못했습니다.", "error");
  } finally {
    setButtonLoading(button, false, loadingText);
  }
}

async function load() {
  try {
    const payload = await requestAdmin();
    applyPayload(payload);
    applyAccess(true);
    setStatus(dom.authStatus, "관리자 패널을 열었습니다.", "success");
  } catch (error) {
    if (error.status === 401) {
      state.token = "";
      sessionStorage.removeItem(TOKEN_KEY);
      applyAccess(false);
      return;
    }
    setStatus(dom.authStatus, error.message || "알림 관리 데이터를 불러오지 못했습니다.", "error");
  }
}

dom.authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await createSession(String(dom.authForm.elements.adminSecret.value || "").trim());
    dom.authForm.reset();
    await load();
  } catch (error) {
    setStatus(dom.authStatus, error.message || "관리자 인증에 실패했습니다.", "error");
  }
});

[dom.areaFilter, dom.channelFilter, dom.enabledFilter].forEach((filter) => filter?.addEventListener("change", renderList));
dom.list?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-template-key]");
  if (!button) return;
  state.selectedKey = button.dataset.templateKey || "";
  state.selectedChannel = button.dataset.templateChannel || "";
  renderList();
  renderEditor();
});

dom.editor?.elements.subject?.addEventListener("focus", (event) => { state.focusedField = event.target; });
dom.editor?.elements.body?.addEventListener("focus", (event) => { state.focusedField = event.target; });
dom.variables?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-variable-key]");
  const field = state.focusedField || dom.editor.elements.body;
  if (!button || !field) return;
  const token = `{{${button.dataset.variableKey}}}`;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  field.setRangeText(token, start, end, "end");
  field.focus();
});

dom.previewModes.forEach((button) => button.addEventListener("click", () => {
  state.previewMode = button.dataset.previewMode || "mobile";
  dom.previewModes.forEach((item) => item.classList.toggle("is-active", item === button));
  dom.preview.dataset.mode = state.previewMode;
}));

dom.previewButton?.addEventListener("click", () => void actionRequest("preview", dom.previewButton, "확인 중..."));
dom.editor?.addEventListener("submit", (event) => { event.preventDefault(); void actionRequest("saveDraft", dom.save, "저장 중..."); });
dom.test?.addEventListener("click", () => void actionRequest("testSend", dom.test, "발송 중..."));
dom.activate?.addEventListener("click", () => {
  if (window.confirm("현재 초안을 실제 자동 알림으로 활성화할까요?")) void actionRequest("activate", dom.activate, "활성화 중...");
});
dom.restore?.addEventListener("click", () => {
  if (window.confirm("기본 템플릿을 초안으로 복원할까요?")) void actionRequest("restoreDefault", dom.restore, "복원 중...");
});
dom.editor?.elements.isEnabled?.addEventListener("change", async () => {
  const template = selectedTemplate();
  if (!template) return;
  if (dom.editor.elements.isEnabled.checked && !window.confirm("이 알림을 활성화할까요?")) {
    dom.editor.elements.isEnabled.checked = false;
    return;
  }
  try {
    applyPayload(await requestAdmin({ method: "POST", body: { action: "setEnabled", templateKey: template.templateKey, channel: template.channel, enabled: dom.editor.elements.isEnabled.checked } }));
  } catch (error) {
    setStatus(dom.editorStatus, error.message, "error");
  }
});

dom.process?.addEventListener("click", async () => {
  setButtonLoading(dom.process, true, "확인 중...");
  try {
    applyPayload(await requestAdmin({ method: "POST", body: { action: "process", limit: 50 } }));
  } catch (error) {
    setStatus(dom.editorStatus, error.message, "error");
  } finally {
    setButtonLoading(dom.process, false, "확인 중...");
  }
});

dom.deliveryList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-notification-retry]");
  if (!button || !window.confirm("이 알림을 새 기록으로 재시도할까요?")) return;
  try {
    applyPayload(await requestAdmin({ method: "POST", body: { action: "retry", outboxId: button.dataset.notificationRetry } }));
  } catch (error) {
    setStatus(dom.editorStatus, error.message, "error");
  }
});

applyAccess(false);
if (state.token) void load();
