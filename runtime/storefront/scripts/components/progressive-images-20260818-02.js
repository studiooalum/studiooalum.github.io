import { normalizeImageRgb, readAverageRgbFromImage } from "../utils/image-colors-20260818-01.js";

const PROGRESSIVE_IMAGE_CLASS = "progressive-image";
const IMAGE_STORAGE_PREFIX = "studiooalum:image-rgb:";
const imageRecords = new WeakMap();
let observer = null;
let initialized = false;

function getImageSource(image) {
  return String(image.currentSrc || image.getAttribute("src") || "").trim();
}

function getStorageKey(source) {
  try {
    const url = new URL(source, window.location.href);
    if (url.protocol === "data:") return "";
    url.hash = "";
    return `${IMAGE_STORAGE_PREFIX}${url.toString()}`;
  } catch {
    return "";
  }
}

function readStoredColor(source) {
  const key = getStorageKey(source);
  if (!key) return "";

  try {
    return normalizeImageRgb(window.localStorage.getItem(key));
  } catch {
    return "";
  }
}

function storeColor(source, color) {
  const key = getStorageKey(source);
  const normalized = normalizeImageRgb(color);
  if (!key || !normalized) return;

  try {
    window.localStorage.setItem(key, normalized);
  } catch {
    // Storage can be unavailable in private browsing contexts.
  }
}

function getUrlColor(source) {
  try {
    const url = new URL(source, window.location.href);
    return normalizeImageRgb(url.searchParams.get("rgb") || url.searchParams.get("color"));
  } catch {
    return "";
  }
}

function getDeclaredColor(image, source) {
  return normalizeImageRgb(image.dataset.imageColor || image.dataset.imageRgb)
    || getUrlColor(source)
    || readStoredColor(source);
}

function shouldSkipProgressiveImage(image) {
  return image.dataset.progressiveImage === "false"
    || image.matches(".gnb__home-logo, .site-footer__logo-mark, .cart-item__img");
}

function getVisualElement(image) {
  return image.parentElement?.tagName === "PICTURE" ? image.parentElement : image;
}

function getWrapper(image) {
  const existing = image.closest(`.${PROGRESSIVE_IMAGE_CLASS}`);
  if (existing) return existing;

  const visual = getVisualElement(image);
  const wrapper = document.createElement("span");
  wrapper.className = PROGRESSIVE_IMAGE_CLASS;
  wrapper.setAttribute("aria-busy", "true");
  visual.before(wrapper);
  wrapper.append(visual);
  return wrapper;
}

function applyColor(wrapper, color) {
  const normalized = normalizeImageRgb(color);
  if (!normalized) return false;
  wrapper.style.setProperty("--progressive-image-rgb", normalized);
  return true;
}

async function readR2Color(source) {
  try {
    const url = new URL(source, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.endsWith("/api/r2") || !url.searchParams.get("key")) {
      return "";
    }

    const response = await fetch(url, {
      method: "HEAD",
      credentials: "same-origin",
      cache: "force-cache",
    });
    return response.ok ? normalizeImageRgb(response.headers.get("X-Oalum-Image-Rgb")) : "";
  } catch {
    return "";
  }
}

async function revealImage(image, record) {
  const current = imageRecords.get(image);
  if (!current || current.source !== record.source) return;

  const color = readAverageRgbFromImage(image);
  if (color) {
    applyColor(record.wrapper, color);
    storeColor(record.source, color);
  }

  try {
    if (typeof image.decode === "function") await image.decode();
  } catch {
    // A successful load event still means the image can be displayed.
  }

  if (imageRecords.get(image) !== record) return;
  requestAnimationFrame(() => {
    if (imageRecords.get(image) !== record) return;
    record.wrapper.classList.add("is-loaded");
    record.wrapper.setAttribute("aria-busy", "false");
  });
}

function setImageSourceState(image, { force = false } = {}) {
  if (!(image instanceof HTMLImageElement) || image.closest("template, noscript") || shouldSkipProgressiveImage(image)) return;

  const source = getImageSource(image);
  const previous = imageRecords.get(image);
  if (!force && previous?.source === source) return;

  const wrapper = previous?.wrapper || getWrapper(image);
  const record = { source, wrapper };
  imageRecords.set(image, record);
  wrapper.classList.remove("is-loaded", "is-error");
  wrapper.setAttribute("aria-busy", "true");

  const declaredColor = getDeclaredColor(image, source);
  if (declaredColor) applyColor(wrapper, declaredColor);
  else if (source) {
    readR2Color(source).then((color) => {
      if (imageRecords.get(image) !== record || !color) return;
      applyColor(wrapper, color);
      storeColor(source, color);
    });
  }

  if (!image.dataset.progressiveImageBound) {
    image.dataset.progressiveImageBound = "true";
    image.addEventListener("load", () => {
      const current = imageRecords.get(image);
      if (current) revealImage(image, current);
    });
    image.addEventListener("error", () => {
      const current = imageRecords.get(image);
      if (!current) return;
      current.wrapper.classList.add("is-error");
      current.wrapper.setAttribute("aria-busy", "false");
    });
  }

  if (image.complete && image.naturalWidth > 0) {
    revealImage(image, record);
  } else if (image.complete && source) {
    wrapper.classList.add("is-error");
    wrapper.setAttribute("aria-busy", "false");
  }
}

function updateDeclaredColor(image) {
  const record = imageRecords.get(image);
  if (!record) {
    setImageSourceState(image);
    return;
  }

  const declaredColor = getDeclaredColor(image, record.source);
  if (declaredColor) {
    applyColor(record.wrapper, declaredColor);
    return;
  }

  if (record.source) {
    readR2Color(record.source).then((color) => {
      if (imageRecords.get(image) !== record || !color) return;
      applyColor(record.wrapper, color);
      storeColor(record.source, color);
    });
  }
}

function scanImages(root) {
  if (root instanceof HTMLImageElement) {
    setImageSourceState(root);
    return;
  }

  if (!(root instanceof Element || root instanceof Document)) return;
  root.querySelectorAll("img").forEach((image) => setImageSourceState(image));
}

function startObserver() {
  if (observer || !document.documentElement) return;

  observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "attributes" && mutation.target instanceof HTMLImageElement) {
        if (mutation.attributeName === "src" || mutation.attributeName === "srcset") {
          setImageSourceState(mutation.target, { force: true });
        } else {
          updateDeclaredColor(mutation.target);
        }
        return;
      }

      mutation.addedNodes.forEach((node) => scanImages(node));
    });
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "srcset", "data-image-color", "data-image-rgb"],
  });
}

export function initProgressiveImages() {
  if (initialized) return;
  initialized = true;

  const start = () => {
    scanImages(document);
    startObserver();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}