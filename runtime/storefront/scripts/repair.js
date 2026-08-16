import { lockBodyScroll, unlockBodyScroll } from "./utils/scroll-lock.js";

const MAX_IMAGE_COUNT = 4;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const DRAWER_SCROLL_LOCK_KEY = "repair-request-drawer";

const dom = {
  apply: document.querySelector("#repairApplyBtn"),
  drawer: document.querySelector("#repairRequestRail"),
  backdrop: document.querySelector("#repairRequestBackdrop"),
  close: document.querySelector("#repairRequestClose"),
  form: document.querySelector(".js-repair-form"),
  emailField: document.querySelector(".js-repair-email-field"),
  emailInput: document.querySelector(".js-repair-email-input"),
  imageInput: document.querySelector(".js-repair-image-input"),
  imageList: document.querySelector(".js-repair-image-preview-list"),
  imageHelp: document.querySelector(".js-repair-image-help"),
  submit: document.querySelector(".js-repair-submit"),
  status: document.querySelector(".js-repair-status"),
  success: document.querySelector(".js-repair-success"),
  successCopy: document.querySelector(".js-repair-success-copy"),
  reset: document.querySelector(".js-repair-reset"),
};

const state = {
  files: [],
  objectUrls: [],
  isDrawerOpen: false,
  trigger: null,
  accountEmail: "",
};

async function syncApplicantEmail() {
  if (!dom.emailField || !dom.emailInput) return;

  try {
    const response = await fetch("./api/auth/session", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    const payload = await response.json().catch(() => null);
    state.accountEmail = payload?.authenticated ? String(payload.user?.email || "").trim() : "";
  } catch {
    state.accountEmail = "";
  }

  const usesAccountEmail = Boolean(state.accountEmail);
  dom.emailField.hidden = usesAccountEmail;
  dom.emailInput.required = !usesAccountEmail;
  dom.emailInput.value = usesAccountEmail ? state.accountEmail : "";
}

function formatFileSize(value) {
  const size = Number(value || 0);
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

function setStatus(message = "", type = "info") {
  if (!dom.status) return;
  dom.status.textContent = message;
  dom.status.classList.remove("is-success", "is-error");
  if (type === "success") dom.status.classList.add("is-success");
  if (type === "error") dom.status.classList.add("is-error");
}

function setSubmitLoading(loading) {
  if (!dom.submit) return;
  if (!dom.submit.dataset.defaultLabel) dom.submit.dataset.defaultLabel = dom.submit.textContent || "수선 접수하기";
  dom.submit.disabled = loading;
  dom.submit.textContent = loading ? "접수 중..." : dom.submit.dataset.defaultLabel;
}

function resetObjectUrls() {
  state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.objectUrls = [];
}

function setDrawerOpen(isOpen, { restoreFocus = true } = {}) {
  if (!dom.drawer || state.isDrawerOpen === isOpen) return;

  state.isDrawerOpen = isOpen;
  dom.drawer.classList.toggle("is-open", isOpen);
  dom.drawer.setAttribute("aria-hidden", String(!isOpen));
  dom.drawer.inert = !isOpen;

  if (isOpen) {
    lockBodyScroll(DRAWER_SCROLL_LOCK_KEY);
    requestAnimationFrame(() => {
      dom.close?.focus();
    });
    return;
  }

  unlockBodyScroll(DRAWER_SCROLL_LOCK_KEY);
  if (restoreFocus && state.trigger?.isConnected) state.trigger.focus();
  state.trigger = null;
}

function openDrawer() {
  state.trigger = document.activeElement instanceof HTMLElement ? document.activeElement : dom.apply;
  setDrawerOpen(true, { restoreFocus: false });
}

function closeDrawer() {
  setDrawerOpen(false);
}

function refreshImageList() {
  if (!dom.imageList) return;
  resetObjectUrls();
  dom.imageList.innerHTML = "";

  state.files.forEach((file, index) => {
    const item = document.createElement("article");
    item.className = "repair-image-preview";

    const image = document.createElement("img");
    const objectUrl = URL.createObjectURL(file);
    state.objectUrls.push(objectUrl);
    image.src = objectUrl;
    image.alt = `첨부 사진 ${index + 1}`;

    const meta = document.createElement("div");
    meta.className = "repair-image-preview__meta";
    const name = document.createElement("p");
    name.textContent = file.name;
    const size = document.createElement("span");
    size.textContent = formatFileSize(file.size);
    meta.append(name, size);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "repair-image-preview__remove";
    remove.setAttribute("aria-label", `${file.name} 제거`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      state.files.splice(index, 1);
      refreshImageList();
    });

    item.append(image, meta, remove);
    dom.imageList.append(item);
  });

  if (dom.imageHelp) {
    dom.imageHelp.textContent = state.files.length
      ? `${state.files.length}/${MAX_IMAGE_COUNT}장 선택됨 · 사진은 관리자만 수선 검토 목적으로 확인합니다.`
      : "필수 · 최대 4장, 장당 8MB까지 가능합니다.";
  }
}

function validateImageFiles(files) {
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.has(String(file.type || "").toLowerCase())) {
      throw new Error("JPG, PNG, WEBP, AVIF 이미지 파일만 선택해주세요.");
    }
    if (Number(file.size || 0) > MAX_IMAGE_SIZE) {
      throw new Error("각 사진은 8MB 이하로 선택해주세요.");
    }
  }
}

function addSelectedImages(fileList) {
  const incoming = Array.from(fileList || []).filter((file) => Number(file.size || 0) > 0);
  if (!incoming.length) return;
  validateImageFiles(incoming);

  if (state.files.length + incoming.length > MAX_IMAGE_COUNT) {
    throw new Error(`사진은 최대 ${MAX_IMAGE_COUNT}장까지 첨부할 수 있습니다.`);
  }

  state.files.push(...incoming);
  refreshImageList();
}

function resetForm() {
  dom.form?.reset();
  state.files = [];
  refreshImageList();
  setStatus("");
  if (dom.success) dom.success.hidden = true;
  if (dom.form) dom.form.hidden = false;
  dom.imageInput && (dom.imageInput.value = "");
}

async function submitRepairRequest() {
  if (!dom.form) return;
  if (!dom.form.reportValidity()) return;
  if (!state.files.length) {
    setStatus("제품 사진을 1장 이상 첨부해주세요.", "error");
    dom.imageInput?.focus();
    return;
  }

  setSubmitLoading(true);
  setStatus("수선 요청을 안전하게 접수하는 중입니다.");

  try {
    const formData = new FormData(dom.form);
    formData.delete("images");
    state.files.forEach((file) => formData.append("images", file, file.name));

    const response = await fetch("./api/repairs", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: formData,
      credentials: "same-origin",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || `Request failed: ${response.status}`);
    }

    const requestNumber = String(payload.requestNumber || "").trim();
    if (dom.successCopy) {
      dom.successCopy.textContent = requestNumber
        ? `접수번호는 ${requestNumber}입니다. 물건이 도착하면 상태를 확인한 뒤 입력하신 연락처로 안내드리겠습니다.`
        : "물건이 도착하면 상태를 확인한 뒤 입력하신 연락처로 안내드리겠습니다.";
    }
    dom.form.hidden = true;
    if (dom.success) dom.success.hidden = false;
    state.files = [];
    resetObjectUrls();
    if (dom.imageInput) dom.imageInput.value = "";
  } catch (error) {
    setStatus(error?.message || "수선 접수를 완료하지 못했습니다.", "error");
  } finally {
    setSubmitLoading(false);
  }
}

export function initRepairRequest() {
  if (!dom.form) return;

  void syncApplicantEmail();

  dom.apply?.addEventListener("click", openDrawer);
  dom.close?.addEventListener("click", closeDrawer);
  dom.backdrop?.addEventListener("click", closeDrawer);

  dom.imageInput?.addEventListener("change", () => {
    try {
      addSelectedImages(dom.imageInput.files);
      setStatus("");
    } catch (error) {
      setStatus(error?.message || "사진을 추가하지 못했습니다.", "error");
    } finally {
      dom.imageInput.value = "";
    }
  });

  dom.form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitRepairRequest();
  });

  dom.reset?.addEventListener("click", resetForm);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.isDrawerOpen) closeDrawer();
  });
  window.addEventListener("pagehide", () => {
    setDrawerOpen(false, { restoreFocus: false });
    resetObjectUrls();
  });
  refreshImageList();
}