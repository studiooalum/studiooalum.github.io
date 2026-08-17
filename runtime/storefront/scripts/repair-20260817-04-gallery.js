import { initRepairRequest as initLegacyRepairRequest } from "./repair-20260817-04-core.js";
import { lockBodyScroll, unlockBodyScroll } from "./utils/scroll-lock-20260816-01.js";

const LIGHTBOX_SCROLL_LOCK_KEY = "repair-gallery-lightbox";
const lightboxMediaQuery = window.matchMedia("(min-width: 960px)");

let lightboxPreviouslyFocused = null;
let lightboxEl = null;
let lightboxCloseEl = null;
let lightboxImageEl = null;
let lightboxPrevEl = null;
let lightboxNextEl = null;
let lightboxImages = [];
let lightboxActiveIndex = 0;

function isLightboxEnabled() {
  return lightboxMediaQuery.matches;
}

function isLightboxOpen() {
  return Boolean(lightboxEl?.classList.contains("is-open"));
}

function normalizeLightboxIndex(index) {
  if (!lightboxImages.length) return 0;
  return (index + lightboxImages.length) % lightboxImages.length;
}

function preloadLightboxImage(index) {
  const item = lightboxImages[index];
  if (!item?.url) return;

  const image = new Image();
  image.src = item.url;
}

function updateLightbox() {
  if (!lightboxImageEl || !lightboxImages.length) return;

  const currentImage = lightboxImages[lightboxActiveIndex];
  lightboxImageEl.src = currentImage.url;
  lightboxImageEl.alt = currentImage.alt || "수선 작업 이미지";

  const hasMultipleImages = lightboxImages.length > 1;
  lightboxPrevEl?.toggleAttribute("hidden", !hasMultipleImages);
  lightboxNextEl?.toggleAttribute("hidden", !hasMultipleImages);

  if (!hasMultipleImages) return;
  preloadLightboxImage(normalizeLightboxIndex(lightboxActiveIndex - 1));
  preloadLightboxImage(normalizeLightboxIndex(lightboxActiveIndex + 1));
}

function stepLightbox(offset) {
  if (lightboxImages.length < 2) return;
  lightboxActiveIndex = normalizeLightboxIndex(lightboxActiveIndex + offset);
  updateLightbox();
}

function closeLightbox() {
  if (!lightboxEl || !isLightboxOpen()) return;

  lightboxEl.classList.remove("is-open");
  lightboxEl.setAttribute("aria-hidden", "true");
  document.body.classList.remove("repair-gallery-lightbox-open");
  unlockBodyScroll(LIGHTBOX_SCROLL_LOCK_KEY);

  if (lightboxPreviouslyFocused?.isConnected) {
    lightboxPreviouslyFocused.focus();
  }
  lightboxPreviouslyFocused = null;
}

function ensureLightbox() {
  if (lightboxEl) return;

  lightboxEl = document.createElement("div");
  lightboxEl.className = "repair-gallery-lightbox";
  lightboxEl.setAttribute("aria-hidden", "true");
  lightboxEl.innerHTML = `
    <div class="repair-gallery-lightbox__backdrop" data-repair-lightbox-close="true"></div>
    <div class="repair-gallery-lightbox__dialog" role="dialog" aria-modal="true" aria-label="수선 작업 이미지 확대 보기">
      <button type="button" class="repair-gallery-lightbox__nav repair-gallery-lightbox__nav--prev" aria-label="이전 이미지">
        <span aria-hidden="true">&lt;</span>
      </button>
      <div class="repair-gallery-lightbox__viewport">
        <figure class="repair-gallery-lightbox__figure">
          <img class="repair-gallery-lightbox__image" alt="">
        </figure>
      </div>
      <button type="button" class="repair-gallery-lightbox__nav repair-gallery-lightbox__nav--next" aria-label="다음 이미지">
        <span aria-hidden="true">&gt;</span>
      </button>
      <button type="button" class="repair-gallery-lightbox__close" aria-label="확대 이미지 닫기"></button>
    </div>
  `;

  document.body.append(lightboxEl);
  lightboxCloseEl = lightboxEl.querySelector(".repair-gallery-lightbox__close");
  lightboxImageEl = lightboxEl.querySelector(".repair-gallery-lightbox__image");
  lightboxPrevEl = lightboxEl.querySelector(".repair-gallery-lightbox__nav--prev");
  lightboxNextEl = lightboxEl.querySelector(".repair-gallery-lightbox__nav--next");

  lightboxEl.addEventListener("click", (event) => {
    if (event.target.closest(".repair-gallery-lightbox__image, .repair-gallery-lightbox__nav, .repair-gallery-lightbox__close")) {
      return;
    }

    if (
      event.target === lightboxEl
      || event.target.closest("[data-repair-lightbox-close]")
      || event.target.closest(".repair-gallery-lightbox__dialog, .repair-gallery-lightbox__viewport, .repair-gallery-lightbox__figure")
    ) {
      closeLightbox();
    }
  });

  lightboxCloseEl?.addEventListener("click", closeLightbox);
  lightboxPrevEl?.addEventListener("click", () => stepLightbox(-1));
  lightboxNextEl?.addEventListener("click", () => stepLightbox(1));

  window.addEventListener("keydown", (event) => {
    if (!isLightboxOpen()) return;

    if (event.key === "Escape") {
      closeLightbox();
      return;
    }
    if (event.key === "ArrowLeft") {
      stepLightbox(-1);
      return;
    }
    if (event.key === "ArrowRight") {
      stepLightbox(1);
    }
  });
}

function readGalleryImages(gallery) {
  return Array.from(gallery.querySelectorAll(".repair-gallery-card img"))
    .map((image) => ({
      url: image.currentSrc || image.src,
      alt: image.alt,
    }))
    .filter((image) => image.url);
}

function openLightbox(images, activeIndex) {
  if (!isLightboxEnabled() || !images.length) return;

  ensureLightbox();
  lightboxPreviouslyFocused = document.activeElement;
  lightboxImages = images;
  lightboxActiveIndex = normalizeLightboxIndex(activeIndex);
  updateLightbox();

  lightboxEl.classList.add("is-open");
  lightboxEl.setAttribute("aria-hidden", "false");
  document.body.classList.add("repair-gallery-lightbox-open");
  lockBodyScroll(LIGHTBOX_SCROLL_LOCK_KEY);

  requestAnimationFrame(() => {
    lightboxCloseEl?.focus();
  });
}

function bindGalleryLightbox() {
  const gallery = document.querySelector(".repair-image-gallery");
  if (!gallery || gallery.dataset.lightboxBound === "true") return;

  gallery.dataset.lightboxBound = "true";
  gallery.addEventListener("click", (event) => {
    const card = event.target.closest(".repair-gallery-card");
    if (!card || !gallery.contains(card) || !isLightboxEnabled()) return;

    const cards = Array.from(gallery.querySelectorAll(".repair-gallery-card"));
    const activeIndex = cards.indexOf(card);
    const images = readGalleryImages(gallery);
    if (activeIndex < 0 || !images[activeIndex]) return;

    event.preventDefault();
    event.stopPropagation();
    openLightbox(images, activeIndex);
  }, true);
}

function handleLightboxViewportChange(event) {
  if (!event.matches) closeLightbox();
}

if (typeof lightboxMediaQuery.addEventListener === "function") {
  lightboxMediaQuery.addEventListener("change", handleLightboxViewportChange);
} else if (typeof lightboxMediaQuery.addListener === "function") {
  lightboxMediaQuery.addListener(handleLightboxViewportChange);
}

export function initRepairRequest() {
  initLegacyRepairRequest();
  bindGalleryLightbox();
}