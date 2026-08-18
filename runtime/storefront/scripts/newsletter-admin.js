import { readAverageRgbFromFile } from "./utils/image-colors-20260818-01.js";

const ADMIN_ACCESS_TOKEN_KEY = "studiooalum:order-admin-access-token";
const ADMIN_ACCESS_EXPIRES_AT_KEY = "studiooalum:order-admin-access-expires-at";

const dom = {
  authForm: document.querySelector(".js-newsletter-admin-auth-form"),
  authClear: document.querySelector(".js-newsletter-admin-auth-clear"),
  authStatus: document.querySelector(".js-newsletter-admin-auth-status"),
  authGuards: Array.from(document.querySelectorAll("[data-newsletter-admin-auth-guard]")),
  postList: document.querySelector(".js-newsletter-admin-post-list"),
  newButton: document.querySelector(".js-newsletter-admin-new-btn"),
  form: document.querySelector(".js-newsletter-admin-form"),
  postStatus: document.querySelector(".js-newsletter-admin-post-status"),
  status: document.querySelector(".js-newsletter-admin-status"),
  coverInput: document.querySelector(".js-newsletter-admin-cover-input"),
  coverUploadButton: document.querySelector(".js-newsletter-admin-cover-upload"),
  coverRemoveButton: document.querySelector(".js-newsletter-admin-cover-remove"),
  coverPreview: document.querySelector(".js-newsletter-admin-cover-preview"),
  coverAlt: document.querySelector(".newsletter-admin-cover__alt"),
  editor: document.querySelector(".js-newsletter-admin-editor"),
  toolbar: document.querySelector(".newsletter-admin-toolbar"),
  imageLayout: document.querySelector(".js-newsletter-admin-image-layout"),
  imageSize: document.querySelector(".js-newsletter-admin-image-size"),
  imagePosition: document.querySelector(".js-newsletter-admin-image-position"),
  imageColumns: document.querySelector(".js-newsletter-admin-image-columns"),
  fontSize: document.querySelector(".js-newsletter-admin-font-size"),
  inlineImageInput: document.querySelector(".js-newsletter-admin-inline-image-input"),
  inlineImageButton: document.querySelector(".js-newsletter-admin-inline-image-upload"),
  saveDraftButton: document.querySelector(".js-newsletter-admin-save-draft"),
  publishButton: document.querySelector(".js-newsletter-admin-publish"),
  archiveButton: document.querySelector(".js-newsletter-admin-archive"),
};

const state = {
  accessToken: sessionStorage.getItem(ADMIN_ACCESS_TOKEN_KEY) || "",
  accessExpiresAt: sessionStorage.getItem(ADMIN_ACCESS_EXPIRES_AT_KEY) || "",
  isAuthorized: false,
  posts: [],
  selectedSlug: "",
  isDirty: false,
  editorRange: null,
  selectedImageFigure: null,
};

const IMAGE_LAYOUT_DEFAULTS = {
  align: "center",
  size: "full",
  position: "inline",
  layout: "single",
};

const IMAGE_LAYOUT_VALUES = {
  align: new Set(["left", "center", "right"]),
  size: new Set(["small", "medium", "large", "full"]),
  position: new Set(["inline", "breakout"]),
  layout: new Set(["single", "pair-left", "pair-right"]),
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
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

function formatDate(value) {
  if (!value) return "초안";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function formatDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function getStatusLabel(value) {
  if (value === "published") return "게시됨";
  if (value === "archived") return "보관됨";
  return "초안";
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
  const headers = getAuthHeaders(!(body instanceof FormData) && body !== undefined);
  const response = await fetch(url, {
    method,
    headers,
    body: body instanceof FormData ? body : (body === undefined ? undefined : JSON.stringify(body)),
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

function verifyAdminSession() {
  return requestAdmin("/api/orders/admin-session");
}

function applyAccessState() {
  const unlocked = Boolean(state.isAuthorized && state.accessToken);
  dom.authGuards.forEach((element) => {
    element.hidden = !unlocked;
  });
}

function getSelectedPost() {
  return state.posts.find((post) => post.slug === state.selectedSlug) || null;
}

function setDirty(value) {
  state.isDirty = Boolean(value);
}

function confirmDiscard() {
  return !state.isDirty || window.confirm("저장하지 않은 변경사항이 있습니다. 계속할까요?");
}

function renderPostList() {
  if (!dom.postList) return;
  if (!state.posts.length) {
    dom.postList.innerHTML = '<div class="fulfillment-empty">아직 작성한 글이 없습니다.</div>';
    return;
  }

  dom.postList.innerHTML = state.posts.map((post) => {
    const active = post.slug === state.selectedSlug ? " is-active" : "";
    const details = post.status === "published" ? formatDate(post.publishedAt) : getStatusLabel(post.status);
    return `<button type="button" class="newsletter-admin-post-card${active}" data-newsletter-slug="${escapeHtml(post.slug)}">
      <strong>${escapeHtml(post.title || post.slug)}</strong>
      <p>${escapeHtml(details)} · ${escapeHtml(post.slug)}</p>
    </button>`;
  }).join("");
}

function renderCover(post = {}) {
  const imageUrl = String(post.coverImageUrl || "").trim();
  const imageAlt = String(post.coverImageAlt || "").trim();
  if (dom.coverPreview) {
    dom.coverPreview.hidden = !imageUrl;
    dom.coverPreview.innerHTML = imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(imageAlt)}">` : "";
  }
  if (dom.coverRemoveButton) dom.coverRemoveButton.hidden = !imageUrl;
  if (dom.coverAlt) dom.coverAlt.hidden = !imageUrl;
}

function resetForm(post = null) {
  if (!dom.form || !dom.editor) return;
  const item = post || {};
  dom.form.elements.id.value = item.id || "";
  dom.form.elements.slug.value = item.slug || "";
  dom.form.elements.title.value = item.title || "";
  dom.form.elements.excerpt.value = item.excerpt || "";
  dom.form.elements.categories.value = Array.isArray(item.categories) ? item.categories.join(", ") : "";
  dom.form.elements.coverImageUrl.value = item.coverImageUrl || "";
  dom.form.elements.coverImageR2Key.value = item.coverImageR2Key || "";
  dom.form.elements.coverImageAlt.value = item.coverImageAlt || "";
  dom.form.elements.publishedAt.value = formatDateTimeLocal(item.publishedAt);
  dom.editor.innerHTML = item.contentHtml || "";
  state.selectedImageFigure = null;
  syncImageLayoutControls();
  renderCover(item);
  if (dom.postStatus) dom.postStatus.textContent = item.slug ? getStatusLabel(item.status) : "새 초안";
  setDirty(false);
}

function focusField(field, message) {
  const target = typeof field === "string" ? dom.form?.elements[field] : field;
  setStatus(dom.status, message, "error");
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
  target?.focus({ preventScroll: true });
}

function collectPost(status) {
  const title = String(dom.form?.elements.title.value || "").trim();
  const existingSlug = String(dom.form?.elements.slug.value || "").trim();
  const slug = existingSlug || slugifyText(title);
  if (!existingSlug && slug && dom.form) dom.form.elements.slug.value = slug;

  return {
    id: String(dom.form?.elements.id.value || "").trim(),
    slug,
    title,
    excerpt: String(dom.form?.elements.excerpt.value || "").trim(),
    categories: [...new Set(String(dom.form?.elements.categories.value || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))].slice(0, 8),
    contentHtml: String(dom.editor?.innerHTML || "").trim(),
    coverImageUrl: String(dom.form?.elements.coverImageUrl.value || "").trim(),
    coverImageR2Key: String(dom.form?.elements.coverImageR2Key.value || "").trim(),
    coverImageAlt: String(dom.form?.elements.coverImageAlt.value || "").trim(),
    status,
    publishedAt: toIsoDateTime(dom.form?.elements.publishedAt.value),
  };
}

function validatePost(post, status) {
  if (!post.title) {
    focusField("title", "제목을 입력해주세요.");
    return false;
  }
  if (status === "published" && !dom.editor?.textContent.trim()) {
    focusField(dom.editor, "게시하려면 본문을 작성해주세요.");
    return false;
  }
  return true;
}

function applySnapshot(payload) {
  state.posts = Array.isArray(payload?.posts) ? payload.posts : [];
  if (state.selectedSlug && !getSelectedPost()) state.selectedSlug = "";
}

async function loadPosts({ fatalOnAuthError = false } = {}) {
  if (!state.isAuthorized || !state.accessToken) return false;
  try {
    const payload = await requestAdmin("/api/newsletters/admin");
    applySnapshot(payload);
    if (!state.selectedSlug) state.selectedSlug = state.posts[0]?.slug || "";
    renderPostList();
    resetForm(getSelectedPost());
    return true;
  } catch (error) {
    if (error.status === 401) {
      clearAdminAccess();
      applyAccessState();
      setStatus(dom.authStatus, "관리자 세션이 만료됐습니다. 다시 잠금 해제해주세요.", "error");
    } else {
      setStatus(dom.status, error.message || "뉴스레터 글을 불러오지 못했습니다.", "error");
    }
    if (fatalOnAuthError) throw error;
    return false;
  }
}

async function savePost(status, button, { openPreview = false } = {}) {
  const post = collectPost(status);
  if (!validatePost(post, status)) return null;
  setButtonLoading(button, true, status === "published" ? "게시 중..." : "저장 중...");
  setStatus(dom.status, status === "published" ? "뉴스레터를 게시하는 중입니다." : "뉴스레터를 저장하는 중입니다.");

  try {
    const payload = await requestAdmin("/api/newsletters/admin", {
      method: "POST",
      body: { action: "saveNewsletterPost", post },
    });
    applySnapshot(payload);
    state.selectedSlug = post.slug;
    const saved = getSelectedPost();
    renderPostList();
    resetForm(saved);
    setStatus(dom.status, openPreview ? "초안을 저장하고 미리보기를 열었습니다." : (status === "published" ? "뉴스레터를 게시했습니다." : "초안을 저장했습니다."), "success");
    if (openPreview && saved) showPreview(saved);
    return saved;
  } catch (error) {
    if (error.status === 401) {
      clearAdminAccess();
      applyAccessState();
      setStatus(dom.authStatus, "관리자 세션이 만료됐습니다. 다시 잠금 해제해주세요.", "error");
    } else {
      setStatus(dom.status, error.message || "뉴스레터 글을 저장하지 못했습니다.", "error");
    }
    return null;
  } finally {
    setButtonLoading(button, false, status === "published" ? "게시 중..." : "저장 중...");
  }
}

async function archivePost() {
  const post = getSelectedPost();
  if (!post?.slug) {
    setStatus(dom.status, "보관할 글을 먼저 선택해주세요.", "error");
    return;
  }
  setButtonLoading(dom.archiveButton, true, "보관 중...");
  try {
    const payload = await requestAdmin("/api/newsletters/admin", {
      method: "POST",
      body: { action: "archiveNewsletterPost", slug: post.slug },
    });
    applySnapshot(payload);
    state.selectedSlug = post.slug;
    renderPostList();
    resetForm(getSelectedPost());
    setStatus(dom.status, "뉴스레터 글을 보관했습니다.", "success");
  } catch (error) {
    setStatus(dom.status, error.message || "뉴스레터 글을 보관하지 못했습니다.", "error");
  } finally {
    setButtonLoading(dom.archiveButton, false, "보관 중...");
  }
}

function saveEditorRange() {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !dom.editor?.contains(selection.anchorNode)) return;
  state.editorRange = selection.getRangeAt(0).cloneRange();
}

function restoreEditorRange() {
  if (!state.editorRange || !dom.editor) return;
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(state.editorRange);
}

function normalizeImageLayoutValue(type, value) {
  const normalized = String(value || "").trim().toLowerCase();
  return IMAGE_LAYOUT_VALUES[type].has(normalized) ? normalized : IMAGE_LAYOUT_DEFAULTS[type];
}

function getImageFigureFromNode(node) {
  const element = node instanceof Element ? node : node?.parentElement;
  const figure = element?.closest("figure");
  return figure?.querySelector("img") ? figure : null;
}

function getSelectedImageFigure() {
  if (state.selectedImageFigure?.isConnected && dom.editor?.contains(state.selectedImageFigure)) {
    return state.selectedImageFigure;
  }

  const selection = window.getSelection();
  return selection?.rangeCount ? getImageFigureFromNode(selection.anchorNode) : null;
}

function syncImageLayoutControls(figure = getSelectedImageFigure()) {
  if (!dom.imageLayout) return;
  const selected = figure || null;
  state.selectedImageFigure = selected;
  dom.imageLayout.hidden = !selected;
  if (!selected) return;

  const align = normalizeImageLayoutValue("align", selected.getAttribute("data-image-align"));
  const size = normalizeImageLayoutValue("size", selected.getAttribute("data-image-size"));
  const position = normalizeImageLayoutValue("position", selected.getAttribute("data-image-position"));
  const layout = normalizeImageLayoutValue("layout", selected.getAttribute("data-image-layout"));
  if (dom.imageSize) dom.imageSize.value = size;
  if (dom.imagePosition) dom.imagePosition.value = position;
  if (dom.imageColumns) dom.imageColumns.value = layout;
  dom.imageLayout.querySelectorAll("[data-image-align]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.imageAlign === align));
  });
}

function applyImageLayout(type, value) {
  const figure = getSelectedImageFigure();
  if (!figure) {
    setStatus(dom.status, "레이아웃을 바꿀 본문 이미지를 선택해주세요.", "error");
    return;
  }

  const normalized = normalizeImageLayoutValue(type, value);
  const attribute = {
    align: "data-image-align",
    size: "data-image-size",
    position: "data-image-position",
    layout: "data-image-layout",
  }[type];
  figure.setAttribute(attribute, normalized);
  syncImageLayoutControls(figure);
  markEditorDirty();
}

function markEditorDirty() {
  setDirty(true);
}

function insertHtmlAtSelection(html) {
  if (!dom.editor) return;
  dom.editor.focus();
  restoreEditorRange();
  document.execCommand("insertHTML", false, html);
  saveEditorRange();
  markEditorDirty();
}

function applyTextAlignment(alignment) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed || !dom.editor?.contains(selection.anchorNode)) {
    setStatus(dom.status, "정렬할 텍스트를 드래그해 선택해주세요.", "error");
    return;
  }

  const node = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement;
  const block = node?.closest("p, h2, h3, blockquote, li");
  if (!block || !dom.editor.contains(block)) {
    setStatus(dom.status, "문단, 제목 또는 인용문 안에서 정렬을 선택해주세요.", "error");
    return;
  }

  block.setAttribute("data-text-align", alignment);
  saveEditorRange();
  markEditorDirty();
}

function applyTextFontSize(value) {
  restoreEditorRange();
  const selection = window.getSelection();
  const size = Math.round(Number(value));
  if (!selection?.rangeCount || selection.isCollapsed || !dom.editor?.contains(selection.anchorNode) || size < 8 || size > 40) {
    setStatus(dom.status, "크기를 바꿀 텍스트를 드래그해 선택해주세요.", "error");
    return;
  }
  const range = selection.getRangeAt(0);
  const span = document.createElement("span");
  span.setAttribute("data-font-size", String(size));
  span.style.fontSize = `${size}px`;
  try {
    range.surroundContents(span);
    selection.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    selection.addRange(nextRange);
    saveEditorRange();
    markEditorDirty();
  } catch {
    setStatus(dom.status, "하나의 문단 안에서 텍스트를 선택해주세요.", "error");
  }
}

function applyEditorCommand(command) {
  if (!dom.editor) return;
  dom.editor.focus();
  restoreEditorRange();

  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed || !dom.editor.contains(selection.anchorNode)) {
    setStatus(dom.status, "편집할 텍스트를 드래그해 선택해주세요.", "error");
    return;
  }

  if (["align-left", "align-center", "align-right"].includes(command)) {
    applyTextAlignment(command.replace("align-", ""));
    return;
  } else if (command === "h2" || command === "h3") {
    document.execCommand("formatBlock", false, command.toUpperCase());
  } else if (command === "quote") {
    document.execCommand("formatBlock", false, "BLOCKQUOTE");
  } else if (command === "bullet") {
    document.execCommand("insertUnorderedList");
  } else if (command === "number") {
    document.execCommand("insertOrderedList");
  } else if (command === "link") {
    const rawUrl = window.prompt("링크 주소");
    if (!rawUrl) return;
    try {
      const url = new URL(rawUrl, window.location.origin);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid URL");
      document.execCommand("createLink", false, url.toString());
    } catch {
      setStatus(dom.status, "http 또는 https 주소를 입력해주세요.", "error");
      return;
    }
  } else if (command === "clear") {
    document.execCommand("removeFormat");
  } else {
    document.execCommand(command);
  }

  saveEditorRange();
  markEditorDirty();
}

async function uploadImage(file, target) {
  const formData = new FormData();
  formData.append("action", "uploadNewsletterImage");
  formData.append("slug", String(dom.form?.elements.slug.value || "").trim() || slugifyText(dom.form?.elements.title.value || "") || "draft-newsletter");
  formData.append("target", target);
  const averageRgb = await readAverageRgbFromFile(file);
  if (averageRgb) formData.append("imageColor", averageRgb);
  formData.append("file", file);
  return requestAdmin("/api/newsletters/admin", { method: "POST", body: formData });
}

async function uploadCoverImage(file) {
  if (!file) return;
  setButtonLoading(dom.coverUploadButton, true, "업로드 중...");
  try {
    const payload = await uploadImage(file, "cover");
    dom.form.elements.coverImageUrl.value = payload.image?.url || "";
    dom.form.elements.coverImageR2Key.value = payload.image?.key || "";
    renderCover({ coverImageUrl: payload.image?.url || "", coverImageAlt: dom.form.elements.coverImageAlt.value });
    markEditorDirty();
    setStatus(dom.status, "커버 이미지를 추가했습니다.", "success");
  } catch (error) {
    setStatus(dom.status, error.message || "커버 이미지를 업로드하지 못했습니다.", "error");
  } finally {
    setButtonLoading(dom.coverUploadButton, false, "업로드 중...");
    if (dom.coverInput) dom.coverInput.value = "";
  }
}

async function uploadInlineImage(file) {
  if (!file) return;
  setButtonLoading(dom.inlineImageButton, true, "업로드 중...");
  try {
    const payload = await uploadImage(file, "body");
    const url = String(payload.image?.url || "").trim();
    if (!url) throw new Error("업로드한 이미지 주소를 확인할 수 없습니다.");
    insertHtmlAtSelection(`<figure data-image-align="center" data-image-size="full" data-image-position="inline" data-image-layout="single"><img src="${escapeHtml(url)}" alt=""></figure>`);
    const insertedFigures = Array.from(dom.editor?.querySelectorAll("figure") || []);
    const inserted = insertedFigures.reverse().find((figure) => figure.querySelector("img")?.getAttribute("src") === url);
    syncImageLayoutControls(inserted || null);
    setStatus(dom.status, "본문 이미지를 추가했습니다.", "success");
  } catch (error) {
    setStatus(dom.status, error.message || "본문 이미지를 업로드하지 못했습니다.", "error");
  } finally {
    setButtonLoading(dom.inlineImageButton, false, "업로드 중...");
    if (dom.inlineImageInput) dom.inlineImageInput.value = "";
  }
}

function attachEvents() {
  dom.authForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const secret = String(dom.authForm.elements.adminSecret.value || "").trim();
    const button = dom.authForm.querySelector('button[type="submit"]');
    if (!secret) {
      setStatus(dom.authStatus, "관리자 키를 입력해주세요.", "error");
      return;
    }
    setButtonLoading(button, true, "확인 중...");
    try {
      const session = await createAdminSession(secret);
      persistAdminAccess(session.accessToken, session.expiresAt);
      state.isAuthorized = true;
      dom.authForm.elements.adminSecret.value = "";
      applyAccessState();
      await loadPosts({ fatalOnAuthError: true });
      setStatus(dom.authStatus, "관리자 세션을 활성화했습니다.", "success");
    } catch (error) {
      clearAdminAccess();
      applyAccessState();
      setStatus(dom.authStatus, error.message || "관리자 세션을 활성화하지 못했습니다.", "error");
    } finally {
      setButtonLoading(button, false, "확인 중...");
    }
  });

  dom.authClear?.addEventListener("click", () => {
    clearAdminAccess();
    state.posts = [];
    state.selectedSlug = "";
    renderPostList();
    resetForm();
    applyAccessState();
    setStatus(dom.authStatus, "관리자 세션을 초기화했습니다.");
  });

  dom.postList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-newsletter-slug]");
    if (!button || !confirmDiscard()) return;
    state.selectedSlug = button.dataset.newsletterSlug || "";
    renderPostList();
    resetForm(getSelectedPost());
  });

  dom.newButton?.addEventListener("click", () => {
    if (!confirmDiscard()) return;
    state.selectedSlug = "";
    renderPostList();
    resetForm();
    dom.form?.elements.title.focus();
  });

  dom.form?.elements.title?.addEventListener("input", () => {
    if (!String(dom.form.elements.slug.value || "").trim()) {
      dom.form.elements.slug.value = slugifyText(dom.form.elements.title.value);
    }
    markEditorDirty();
  });

  dom.form?.addEventListener("input", markEditorDirty);
  dom.form?.addEventListener("change", markEditorDirty);

  dom.coverUploadButton?.addEventListener("click", () => dom.coverInput?.click());
  dom.coverInput?.addEventListener("change", (event) => uploadCoverImage(event.target.files?.[0]));
  dom.coverRemoveButton?.addEventListener("click", () => {
    dom.form.elements.coverImageUrl.value = "";
    dom.form.elements.coverImageR2Key.value = "";
    dom.form.elements.coverImageAlt.value = "";
    renderCover();
    markEditorDirty();
  });

  dom.editor?.addEventListener("keyup", () => {
    saveEditorRange();
    syncImageLayoutControls();
  });
  dom.editor?.addEventListener("mouseup", () => {
    saveEditorRange();
    syncImageLayoutControls();
  });
  dom.editor?.addEventListener("focus", saveEditorRange);
  dom.editor?.addEventListener("click", (event) => {
    syncImageLayoutControls(getImageFigureFromNode(event.target));
  });
  dom.editor?.addEventListener("input", markEditorDirty);
  dom.editor?.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") || "";
    document.execCommand("insertText", false, text);
    markEditorDirty();
  });

  dom.toolbar?.addEventListener("mousedown", (event) => {
    if (event.target.closest("button")) event.preventDefault();
  });
  dom.toolbar?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-editor-command]");
    if (button) applyEditorCommand(button.dataset.editorCommand || "");
  });
  dom.imageLayout?.addEventListener("click", (event) => {
    const alignmentButton = event.target.closest("[data-image-align]");
    if (alignmentButton) applyImageLayout("align", alignmentButton.dataset.imageAlign || "");
  });
  dom.imageSize?.addEventListener("change", () => applyImageLayout("size", dom.imageSize.value));
  dom.imagePosition?.addEventListener("change", () => applyImageLayout("position", dom.imagePosition.value));
  dom.imageColumns?.addEventListener("change", () => applyImageLayout("layout", dom.imageColumns.value));
  dom.fontSize?.addEventListener("change", () => applyTextFontSize(dom.fontSize.value));
  dom.inlineImageButton?.addEventListener("click", () => dom.inlineImageInput?.click());
  dom.inlineImageInput?.addEventListener("change", (event) => uploadInlineImage(event.target.files?.[0]));

  dom.saveDraftButton?.addEventListener("click", () => savePost("draft", dom.saveDraftButton));
  dom.publishButton?.addEventListener("click", () => savePost("published", dom.publishButton));
  dom.archiveButton?.addEventListener("click", archivePost);

  window.addEventListener("beforeunload", (event) => {
    if (!state.isDirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

attachEvents();
applyAccessState();
renderPostList();
resetForm();

if (state.accessToken) {
  verifyAdminSession()
    .then(async (payload) => {
      state.isAuthorized = true;
      persistAdminAccess(state.accessToken, payload.expiresAt || state.accessExpiresAt);
      applyAccessState();
      await loadPosts({ fatalOnAuthError: true });
      setStatus(dom.authStatus, "관리자 세션을 복원했습니다.", "success");
    })
    .catch((error) => {
      clearAdminAccess();
      applyAccessState();
      setStatus(dom.authStatus, error.message || "관리자 세션을 확인하지 못했습니다.", "error");
    });
}