import { lockBodyScroll, unlockBodyScroll } from "./utils/scroll-lock-20260816-01.js";
import {
  normalizeImageRgb,
  readAverageRgbFromImage,
  readStoredImageRgb,
  storeImageRgb,
} from "./utils/image-colors-20260818-01.js";

const MAX_IMAGE_COUNT = 4;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const DRAWER_SCROLL_LOCK_KEY = "repair-request-drawer";
const mobileGalleryMediaQuery = window.matchMedia("(max-width: 959px)");

const dom = {
  apply: document.querySelector("#repairApplyBtn"),
  drawer: document.querySelector("#repairRequestRail"),
  backdrop: document.querySelector("#repairRequestBackdrop"),
  close: document.querySelector("#repairRequestClose"),
  form: document.querySelector(".js-repair-form"),
  nameInput: document.querySelector("[name='customerName']"),
  emailField: document.querySelector(".js-repair-email-field"),
  emailInput: document.querySelector(".js-repair-email-input"),
  phoneInput: document.querySelector(".js-repair-phone-input"),
  country: document.querySelector(".js-repair-country"),
  countryCustomField: document.querySelector(".js-repair-country-custom-field"),
  countryCustom: document.querySelector(".js-repair-country-custom"),
  postalCode: document.querySelector(".js-repair-postal-code"),
  addressLine1: document.querySelector(".js-repair-address-line1"),
  addressLine2: document.querySelector(".js-repair-address-line2"),
  addressSearch: document.querySelector(".js-repair-address-search"),
  imageInput: document.querySelector(".js-repair-image-input"),
  imageList: document.querySelector(".js-repair-image-preview-list"),
  imageHelp: document.querySelector(".js-repair-image-help"),
  submit: document.querySelector(".js-repair-submit"),
  status: document.querySelector(".js-repair-status"),
  success: document.querySelector(".js-repair-success"),
  successCopy: document.querySelector(".js-repair-success-copy"),
  successTicket: document.querySelector(".js-repair-success-ticket"),
  reset: document.querySelector(".js-repair-reset"),
  publicGallery: document.querySelector(".repair-image-gallery"),
  priceTabs: Array.from(document.querySelectorAll("[data-repair-price-tab]")),
  pricePanels: Array.from(document.querySelectorAll("[data-repair-price-panel]")),
};

const state = {
  files: [],
  objectUrls: [],
  isDrawerOpen: false,
  trigger: null,
  accountEmail: "",
  accountSyncVersion: 0,
  gallery: [],
};

const METHOD_LABELS = {
  patch: "PATCH",
  woven: "WOVEN",
  sashiko: "SASHIKO / VISIBLE MENDING",
  boro: "BORO",
};

const FIELD_LABELS = {
  customerName: "이름",
  phone: "전화번호",
  email: "이메일 주소",
  country: "국가",
  countryCustom: "국가명",
  postalCode: "우편번호",
  addressLine1: "주소",
  addressLine2: "상세주소",
  itemType: "제품 종류",
  issueDescription: "손상 부위",
  desiredResult: "수선 방향",
  privacyConsent: "개인정보 수집·이용 동의",
};

function setAverageColor(card, image) {
  const color = readAverageRgbFromImage(image);
  if (!color) return;
  card.style.setProperty("--repair-gallery-rgb", color);
  storeImageRgb(image.currentSrc || image.src, color);
}

function formatMethods(methods = []) {
  return methods.map((method) => METHOD_LABELS[method] || String(method).toUpperCase());
}

function setPricePanel(name) {
  dom.priceTabs.forEach((button) => {
    const active = button.dataset.repairPriceTab === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  dom.pricePanels.forEach((panel) => {
    panel.hidden = panel.dataset.repairPricePanel !== name;
  });
}

function updateGalleryDots(dots, activeIndex) {
  dots.forEach((dot, index) => {
    const isActive = index === activeIndex;
    dot.classList.toggle("is-active", isActive);
    dot.setAttribute("aria-current", String(isActive));
  });
}

function bindGalleryDots(track, dots) {
  if (!track || !dots.length) return;

  let frameId = null;
  const sync = () => {
    frameId = null;
    const slideWidth = track.clientWidth || 1;
    const activeIndex = Math.max(0, Math.min(dots.length - 1, Math.round(track.scrollLeft / slideWidth)));
    updateGalleryDots(dots, activeIndex);
  };

  track.addEventListener("scroll", () => {
    if (frameId != null) return;
    frameId = requestAnimationFrame(sync);
  }, { passive: true });

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      track.scrollTo({ left: track.clientWidth * index, behavior: "smooth" });
    });
  });

  window.addEventListener("resize", sync);
  requestAnimationFrame(sync);
}

function toggleGalleryOverlay(card) {
  const shouldShow = !card.classList.contains("is-overlay-visible");
  dom.publicGallery?.querySelectorAll(".repair-gallery-card.is-overlay-visible").forEach((item) => {
    item.classList.remove("is-overlay-visible");
    item.setAttribute("aria-pressed", "false");
  });
  card.classList.toggle("is-overlay-visible", shouldShow);
  card.setAttribute("aria-pressed", String(shouldShow));
}

async function initPublicGallery() {
  if (!dom.publicGallery) return;
  try {
    const response = await fetch("./api/repairs/gallery", { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => null);
    state.gallery = response.ok && Array.isArray(payload?.gallery) ? payload.gallery : [];
  } catch {
    state.gallery = [];
  }

  if (!state.gallery.length) {
    dom.publicGallery.replaceChildren();
    return;
  }

  const slider = document.createElement("div");
  slider.className = "repair-gallery-slider";
  const track = document.createElement("div");
  track.className = "repair-gallery-track";
  const dotsElement = document.createElement("div");
  dotsElement.className = "repair-gallery-dots";
  dotsElement.setAttribute("aria-label", "수선 작업 이미지 선택");
  const dots = [];

  state.gallery.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "repair-gallery-card";
    button.setAttribute("aria-label", `${formatMethods(item.methods).join(", ")} 이미지 보기`);
    button.setAttribute("aria-pressed", "false");
    const averageRgb = normalizeImageRgb(item.averageRgb) || readStoredImageRgb(item.url);
    if (averageRgb) button.style.setProperty("--repair-gallery-rgb", averageRgb);
    const image = document.createElement("img");
    if (averageRgb) image.dataset.imageColor = averageRgb;
    image.src = item.url;
    image.alt = item.filename || "수선 작업 이미지";
    image.loading = "lazy";
    image.draggable = false;
    image.addEventListener("load", () => setAverageColor(button, image), { once: true });
    const overlay = document.createElement("span");
    overlay.className = "repair-gallery-card__overlay";
    overlay.textContent = formatMethods(item.methods).join("\n");
    button.append(image, overlay);
    button.addEventListener("click", () => {
      if (mobileGalleryMediaQuery.matches) toggleGalleryOverlay(button);
    });
    track.append(button);

    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = `repair-gallery-dot${index === 0 ? " is-active" : ""}`;
    dot.setAttribute("aria-label", `이미지 ${index + 1}`);
    dot.setAttribute("aria-current", String(index === 0));
    dotsElement.append(dot);
    dots.push(dot);
  });

  slider.append(track);
  dom.publicGallery.replaceChildren(slider, dotsElement);
  bindGalleryDots(track, dots);
}

function clearAccountAutofill() {
  state.accountSyncVersion += 1;
  state.accountEmail = "";
}

function normalizeKoreanPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("82")) digits = `0${digits.slice(2)}`;
  return digits.slice(0, 11);
}

function isKoreanAddress() {
  return !dom.country || dom.country.value === "대한민국";
}

function syncAddressMode() {
  const korean = isKoreanAddress();
  const customCountry = dom.country?.value === "__direct__";
  if (dom.countryCustomField) dom.countryCustomField.hidden = !customCountry;
  if (dom.countryCustom) dom.countryCustom.required = customCountry;
  if (dom.postalCode) {
    dom.postalCode.readOnly = korean;
    dom.postalCode.inputMode = korean ? "numeric" : "text";
  }
  if (dom.addressLine1) dom.addressLine1.readOnly = korean;
  if (dom.addressSearch) dom.addressSearch.hidden = !korean;
  if (dom.phoneInput) {
    dom.phoneInput.placeholder = korean ? "01000000000" : "국가번호를 포함해 숫자만 입력";
    dom.phoneInput.pattern = korean ? "010[0-9]{8}" : "[0-9]{7,15}";
    dom.phoneInput.maxLength = korean ? 11 : 15;
    dom.phoneInput.value = korean
      ? normalizeKoreanPhone(dom.phoneInput.value)
      : String(dom.phoneInput.value || "").replace(/\D/g, "").slice(0, 15);
  }
}

function openKoreanAddressSearch() {
  if (!isKoreanAddress()) return;
  if (typeof window.daum?.Postcode !== "function") {
    if (dom.postalCode) dom.postalCode.readOnly = false;
    if (dom.addressLine1) dom.addressLine1.readOnly = false;
    setStatus("주소 검색을 불러오지 못했습니다. 우편번호와 주소를 직접 입력해주세요.", "error");
    dom.postalCode?.focus();
    return;
  }

  new window.daum.Postcode({
    oncomplete(data) {
      const address = data.userSelectedType === "J"
        ? String(data.jibunAddress || data.autoJibunAddress || "")
        : String(data.roadAddress || data.autoRoadAddress || "");
      if (dom.postalCode) dom.postalCode.value = String(data.zonecode || "");
      if (dom.addressLine1) dom.addressLine1.value = address;
      dom.addressLine2?.focus();
      updateValidationFeedback();
    },
  }).open();
}

async function syncApplicantAccount() {
  if (!dom.emailField || !dom.emailInput) return;

  const syncVersion = ++state.accountSyncVersion;
  let accountUser = null;
  try {
    const response = await fetch("./api/auth/address", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    const payload = await response.json().catch(() => null);
    accountUser = response.ok && payload?.authenticated ? payload.user || null : null;
  } catch {
    accountUser = null;
  }

  if (syncVersion !== state.accountSyncVersion) return;

  state.accountEmail = String(accountUser?.email || "").trim();
  dom.emailField.hidden = false;
  dom.emailInput.required = true;
  if (state.accountEmail && !dom.emailInput.value) dom.emailInput.value = state.accountEmail;
  if (accountUser) {
    if (dom.nameInput && !dom.nameInput.value) dom.nameInput.value = String(accountUser.fullName || "").trim();
    if (dom.phoneInput && !dom.phoneInput.value) dom.phoneInput.value = normalizeKoreanPhone(accountUser.phone || "");
    if (dom.country && !dom.country.value) dom.country.value = "대한민국";
    if (dom.postalCode && !dom.postalCode.value) dom.postalCode.value = String(accountUser.zipcode || "").trim();
    if (dom.addressLine1 && !dom.addressLine1.value) dom.addressLine1.value = String(accountUser.address1 || "").trim();
    if (dom.addressLine2 && !dom.addressLine2.value) dom.addressLine2.value = String(accountUser.address2 || "").trim();
  }
  syncAddressMode();
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

function sanitizeEmailInput() {
  if (!dom.emailInput) return;

  const sanitized = dom.emailInput.value.replace(/\s+/g, "");
  if (dom.emailInput.value !== sanitized) dom.emailInput.value = sanitized;
}

function getValidatableControls() {
  if (!dom.form) return [];

  return Array.from(dom.form.elements).filter((control) => (
    (control instanceof HTMLInputElement
      || control instanceof HTMLSelectElement
      || control instanceof HTMLTextAreaElement)
    && control.willValidate
  ));
}

function getValidationOwner(control) {
  if (control.name === "desiredResult") return control.closest(".repair-choice-group");
  if (control.name === "privacyConsent") return control.closest(".repair-checkbox");
  return control.closest(".repair-field");
}

function getValidationMessage(invalidControls) {
  const labels = [...new Set(invalidControls.map((control) => {
    if (control.name === "email" && control.validity.typeMismatch) return "이메일 형식";
    return FIELD_LABELS[control.name] || "입력 내용";
  }))];

  return `다음 항목을 확인해주세요: ${labels.join(", ")}.`;
}

function syncValidationFeedback({ includeImages = false } = {}) {
  const controls = getValidatableControls();
  const invalidControls = controls.filter((control) => !control.validity.valid);
  const invalidOwners = new Set(invalidControls.map(getValidationOwner).filter(Boolean));
  const owners = new Set(controls.map(getValidationOwner).filter(Boolean));

  controls.forEach((control) => {
    if (invalidControls.includes(control)) {
      control.setAttribute("aria-invalid", "true");
    } else {
      control.removeAttribute("aria-invalid");
    }
  });

  owners.forEach((owner) => {
    owner.classList.toggle("is-invalid", invalidOwners.has(owner));
  });

  const imageSection = dom.imageInput?.closest(".repair-request-form__section--images");
  if (includeImages) {
    imageSection?.classList.toggle("is-invalid", state.files.length === 0);
  } else {
    imageSection?.classList.remove("is-invalid");
  }

  return invalidControls;
}

function clearValidationFeedback() {
  dom.form?.classList.remove("is-validation-visible");
  dom.form?.querySelectorAll(".repair-field.is-invalid, .repair-choice-group.is-invalid, .repair-checkbox.is-invalid, .repair-request-form__section--images.is-invalid").forEach((element) => {
    element.classList.remove("is-invalid");
  });
  dom.form?.querySelectorAll("[aria-invalid='true']").forEach((element) => {
    element.removeAttribute("aria-invalid");
  });
}

function validateRepairForm() {
  if (!dom.form) return false;

  dom.form.classList.add("is-validation-visible");
  const invalidControls = syncValidationFeedback({ includeImages: true });
  if (invalidControls.length) {
    setStatus(getValidationMessage(invalidControls), "error");
    return false;
  }

  if (!state.files.length) {
    setStatus("제품 사진을 1장 이상 첨부해주세요.", "error");
    return false;
  }

  return true;
}

function updateValidationFeedback() {
  if (!dom.form?.classList.contains("is-validation-visible")) return;

  const invalidControls = syncValidationFeedback({ includeImages: true });
  if (invalidControls.length) {
    setStatus(getValidationMessage(invalidControls), "error");
    return;
  }

  if (!state.files.length) {
    setStatus("제품 사진을 1장 이상 첨부해주세요.", "error");
    return;
  }

  setStatus("");
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
      updateValidationFeedback();
    });

    item.append(image, meta, remove);
    dom.imageList.append(item);
  });

  if (dom.imageHelp) {
    dom.imageHelp.textContent = state.files.length
      ? `${state.files.length}/${MAX_IMAGE_COUNT}장 선택됨 · 사진은 관리자만 수선 검토 목적으로 확인합니다.`
      : "(필수) · 최대 4장, 장당 8MB까지 가능합니다.";
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
  clearValidationFeedback();
  setStatus("");
  if (dom.success) dom.success.hidden = true;
  if (dom.successTicket) dom.successTicket.hidden = true;
  if (dom.form) dom.form.hidden = false;
  dom.imageInput && (dom.imageInput.value = "");
  syncAddressMode();
  void syncApplicantAccount();
}

async function submitRepairRequest() {
  if (!dom.form) return;
  if (!validateRepairForm()) return;

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

    const ticketNumber = Number(payload.ticketNumber || 0);
    const requestNumber = String(payload.requestNumber || "").trim();
    if (dom.successCopy) {
      dom.successCopy.textContent = Number.isInteger(ticketNumber) && ticketNumber > 0
        ? `수선 티켓 #${String(ticketNumber).padStart(3, "0")}이 생성되었습니다.`
        : `수선 접수가 완료되었습니다.${requestNumber ? ` 비회원 조회번호는 ${requestNumber}입니다.` : ""} 제품 도착 후 수선 가능 여부와 예상 가격을 안내드리며, 실제 수선을 시작할 때 티켓 번호가 발급됩니다.`;
    }
    if (dom.successTicket) {
      const ticketUrl = String(payload.ticketUrl || "").trim();
      dom.successTicket.href = ticketUrl || "./account.html";
      dom.successTicket.hidden = !ticketUrl;
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

  void syncApplicantAccount();
  void initPublicGallery();

  dom.apply?.addEventListener("click", openDrawer);
  dom.close?.addEventListener("click", closeDrawer);
  dom.backdrop?.addEventListener("click", closeDrawer);

  dom.imageInput?.addEventListener("change", () => {
    let imagesAdded = false;
    try {
      addSelectedImages(dom.imageInput.files);
      setStatus("");
      imagesAdded = true;
    } catch (error) {
      setStatus(error?.message || "사진을 추가하지 못했습니다.", "error");
    } finally {
      dom.imageInput.value = "";
    }
    if (imagesAdded) updateValidationFeedback();
  });

  dom.form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitRepairRequest();
  });

  dom.emailInput?.addEventListener("input", sanitizeEmailInput);
  dom.phoneInput?.addEventListener("input", () => {
    dom.phoneInput.value = isKoreanAddress()
      ? normalizeKoreanPhone(dom.phoneInput.value)
      : String(dom.phoneInput.value || "").replace(/\D/g, "").slice(0, 15);
  });
  dom.country?.addEventListener("change", syncAddressMode);
  dom.addressSearch?.addEventListener("click", openKoreanAddressSearch);
  dom.form.addEventListener("input", updateValidationFeedback);
  dom.form.addEventListener("change", updateValidationFeedback);

  dom.reset?.addEventListener("click", resetForm);
  dom.priceTabs.forEach((button) => button.addEventListener("click", () => setPricePanel(button.dataset.repairPriceTab || "basic")));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.isDrawerOpen) closeDrawer();
  });
  window.addEventListener("pagehide", () => {
    clearAccountAutofill();
    setDrawerOpen(false, { restoreFocus: false });
    resetObjectUrls();
  });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    clearAccountAutofill();
    void syncApplicantAccount();
  });
  refreshImageList();
  syncAddressMode();
}
