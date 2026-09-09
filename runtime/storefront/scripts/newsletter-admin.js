import { readAverageRgbFromFile } from "./utils/image-colors-20260818-01.js";
import { mountNewsletterTiptapEditor } from "./newsletter-tiptap-editor.js";

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
  editorRoot: document.querySelector(".js-newsletter-admin-editor-root"),
  saveDraftButton: document.querySelector(".js-newsletter-admin-save-draft"),
  publishButton: document.querySelector(".js-newsletter-admin-publish"),
  archiveButton: document.querySelector(".js-newsletter-admin-archive"),
  deleteButton: document.querySelector(".js-newsletter-admin-delete"),
};

const state = {
  accessToken: sessionStorage.getItem(ADMIN_ACCESS_TOKEN_KEY) || "",
  accessExpiresAt: sessionStorage.getItem(ADMIN_ACCESS_EXPIRES_AT_KEY) || "",
  isAuthorized: false,
  posts: [],
  selectedSlug: "",
  isDirty: false,
  editorHtml: "",
  isSaving: false,
  isUploading: false,
};

let editorController = null;

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

function setActionLoading(button, loading, label) {
  state.isSaving = loading;
  setButtonLoading(button, loading, label);
  [dom.saveDraftButton, dom.publishButton, dom.archiveButton, dom.deleteButton].forEach((actionButton) => {
    if (actionButton) {
      actionButton.disabled = state.isSaving
        || state.isUploading
        || (actionButton === dom.deleteButton && getSelectedPost()?.status === "published");
    }
  });
  editorController?.setDisabled(loading);
}

function setInlineUploadLoading(loading) {
  state.isUploading = loading;
  [dom.saveDraftButton, dom.publishButton, dom.archiveButton, dom.deleteButton].forEach((actionButton) => {
    if (actionButton) {
      actionButton.disabled = state.isSaving
        || state.isUploading
        || (actionButton === dom.deleteButton && getSelectedPost()?.status === "published");
    }
  });
  if (dom.newButton) dom.newButton.disabled = state.isUploading;
  dom.postList?.querySelectorAll("[data-newsletter-slug]").forEach((postButton) => {
    postButton.disabled = state.isUploading;
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
  if (!dom.form) return;
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
  state.editorHtml = item.contentHtml || "";
  editorController?.setContent(state.editorHtml, item.id || item.slug || "new");
  renderCover(item);
  if (dom.postStatus) dom.postStatus.textContent = item.slug ? getStatusLabel(item.status) : "새 초안";
  if (dom.deleteButton) {
    dom.deleteButton.hidden = !item.slug;
    dom.deleteButton.disabled = item.status === "published";
    dom.deleteButton.title = item.status === "published" ? "게시 중인 글은 먼저 보관해주세요." : "뉴스레터 글을 영구 삭제합니다.";
  }
  setDirty(false);
}

function focusField(field, message) {
  const target = typeof field === "string" ? dom.form?.elements[field] : field;
  setStatus(dom.status, message, "error");
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
  if (target === dom.editorRoot) editorController?.focus();
  else target?.focus({ preventScroll: true });
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
    contentHtml: String(editorController?.getHTML() ?? state.editorHtml).trim(),
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
  if (status === "published" && editorController?.isEmpty()) {
    focusField(dom.editorRoot, "게시하려면 본문을 작성해주세요.");
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
  if (state.isSaving || state.isUploading) return null;
  const post = collectPost(status);
  if (!validatePost(post, status)) return null;
  setActionLoading(button, true, status === "published" ? "게시 중..." : "저장 중...");
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
    setActionLoading(button, false, status === "published" ? "게시 중..." : "저장 중...");
  }
}

async function archivePost() {
  if (state.isSaving || state.isUploading) return;
  const post = getSelectedPost();
  if (!post?.slug) {
    setStatus(dom.status, "보관할 글을 먼저 선택해주세요.", "error");
    return;
  }
  setActionLoading(dom.archiveButton, true, "보관 중...");
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
    setActionLoading(dom.archiveButton, false, "보관 중...");
  }
}

async function deletePost() {
  if (state.isSaving || state.isUploading) return;
  const post = getSelectedPost();
  if (!post?.slug) {
    setStatus(dom.status, "삭제할 글을 먼저 선택해주세요.", "error");
    return;
  }
  if (post.status === "published") {
    setStatus(dom.status, "게시 중인 글은 먼저 보관한 뒤 삭제해주세요.", "error");
    return;
  }
  if (!window.confirm(`뉴스레터 '${post.title || post.slug}'을(를) 영구 삭제할까요?`)) return;

  setActionLoading(dom.deleteButton, true, "삭제 중...");
  setStatus(dom.status, "뉴스레터 글을 삭제하는 중입니다.");
  try {
    const payload = await requestAdmin("/api/newsletters/admin", {
      method: "POST",
      body: { action: "deleteNewsletterPost", slug: post.slug },
    });
    applySnapshot(payload);
    state.selectedSlug = state.posts[0]?.slug || "";
    renderPostList();
    resetForm(getSelectedPost());
    setStatus(dom.status, "뉴스레터 글을 삭제했습니다.", "success");
  } catch (error) {
    setStatus(dom.status, error.message || "뉴스레터 글을 삭제하지 못했습니다.", "error");
  } finally {
    setActionLoading(dom.deleteButton, false, "삭제 중...");
  }
}

function markEditorDirty() {
  setDirty(true);
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
  if (!file) return "";
  const payload = await uploadImage(file, "body");
  const url = String(payload.image?.url || "").trim();
  if (!url) throw new Error("업로드한 이미지 주소를 확인할 수 없습니다.");
  return url;
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
    if (state.isUploading) {
      setStatus(dom.status, "이미지 업로드가 끝난 뒤 다른 글로 이동해주세요.", "error");
      return;
    }
    if (!button || !confirmDiscard()) return;
    state.selectedSlug = button.dataset.newsletterSlug || "";
    renderPostList();
    resetForm(getSelectedPost());
  });

  dom.newButton?.addEventListener("click", () => {
    if (state.isUploading) {
      setStatus(dom.status, "이미지 업로드가 끝난 뒤 새 글을 작성해주세요.", "error");
      return;
    }
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

  dom.saveDraftButton?.addEventListener("click", () => savePost("draft", dom.saveDraftButton));
  dom.publishButton?.addEventListener("click", () => savePost("published", dom.publishButton));
  dom.archiveButton?.addEventListener("click", archivePost);
  dom.deleteButton?.addEventListener("click", deletePost);

  window.addEventListener("beforeunload", (event) => {
    if (!state.isDirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

editorController = mountNewsletterTiptapEditor(dom.editorRoot, {
  value: "",
  contentKey: "new",
  onChange: (html) => {
    state.editorHtml = html;
    markEditorDirty();
  },
  onUploadImage: uploadInlineImage,
  onUploadStateChange: setInlineUploadLoading,
  onStatus: (message, type) => setStatus(dom.status, message, type),
});

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