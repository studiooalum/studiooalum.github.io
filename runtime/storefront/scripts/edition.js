import client from "./sanity/client.js";
import { ALL_PRODUCTS_QUERY, PRODUCT_BY_SLUG_QUERY } from "./sanity/queries.js";
import { imageUrl } from "./sanity/image.js";
import { addToCart, addToCartSilent } from "./cart.js";
import { lockBodyScroll, unlockBodyScroll } from "./utils/scroll-lock.js";
import { formatPrice, getFirstParagraph, getProductTags, parseProductTitle, pickRepresentativeEdition } from "./utils/catalog.js";
import { buildBreadcrumbList, setJsonLd, toAbsoluteUrl, truncateDescription, updatePageSeo } from "./utils/seo.js";

const params = new URLSearchParams(window.location.search);
const slug = params.get("slug");
const lightboxMediaQuery = window.matchMedia("(min-width: 960px)");

function getShopPath() {
  return "./shop";
}

if (!slug) {
  window.location.href = getShopPath();
}

const mediaEl = document.getElementById("editionMedia");
const sidebarTrackEl = document.getElementById("editionSidebarTrack");
const sidebarEl = document.getElementById("editionSidebar");
const kickerEl = document.getElementById("editionKicker");
const titleEl = document.getElementById("editionTitle");
const numberEl = document.getElementById("editionNumber");
const priceEl = document.getElementById("editionPrice");
const descEl = document.getElementById("editionDesc");
const tagsEl = document.getElementById("editionTags");
const recommendGridEl = document.getElementById("recommendGrid");
const addBtn = document.getElementById("addToCartBtn");
const buyBtn = document.getElementById("buyNowBtn");
const noteEl = document.getElementById("editionNote");
const backEl = document.getElementById("editionBack");

let lightboxPreviouslyFocused = null;

let lightboxEl = null;
let lightboxCloseEl = null;
let lightboxImageEl = null;
let lightboxPrevEl = null;
let lightboxNextEl = null;
let lightboxImages = [];
let lightboxActiveIndex = 0;
let galleryResizeHandlerBound = false;

function isLightboxEnabled() {
  return lightboxMediaQuery.matches;
}

function isLightboxOpen() {
  return !!lightboxEl?.classList.contains("is-open");
}

function normalizeLightboxIndex(index) {
  if (lightboxImages.length === 0) return 0;
  return (index + lightboxImages.length) % lightboxImages.length;
}

function preloadLightboxImage(index) {
  const item = lightboxImages[index];
  if (!item?.url) return;

  const image = new Image();
  image.src = item.url;
}

function updateLightbox() {
  if (!lightboxImageEl || lightboxImages.length === 0) return;

  const currentImage = lightboxImages[lightboxActiveIndex];
  lightboxImageEl.src = currentImage.url;
  lightboxImageEl.alt = currentImage.alt || "상품 이미지";

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

function ensureLightbox() {
  if (lightboxEl) return;

  lightboxEl = document.createElement("div");
  lightboxEl.className = "edition-lightbox";
  lightboxEl.innerHTML = `
    <div class="edition-lightbox__backdrop" data-lightbox-close="true"></div>
    <div class="edition-lightbox__dialog" role="dialog" aria-modal="true" aria-label="상품 이미지 확대 보기">
      <button type="button" class="edition-lightbox__nav edition-lightbox__nav--prev" aria-label="이전 이미지">
        <span aria-hidden="true">&lt;</span>
      </button>
      <div class="edition-lightbox__viewport">
        <figure class="edition-lightbox__figure">
          <img class="edition-lightbox__image" alt="">
        </figure>
      </div>
      <button type="button" class="edition-lightbox__nav edition-lightbox__nav--next" aria-label="다음 이미지">
        <span aria-hidden="true">&gt;</span>
      </button>
      <button type="button" class="edition-lightbox__close" aria-label="확대 이미지 닫기"></button>
    </div>
  `;

  document.body.appendChild(lightboxEl);
  lightboxCloseEl = lightboxEl.querySelector(".edition-lightbox__close");
  lightboxImageEl = lightboxEl.querySelector(".edition-lightbox__image");
  lightboxPrevEl = lightboxEl.querySelector(".edition-lightbox__nav--prev");
  lightboxNextEl = lightboxEl.querySelector(".edition-lightbox__nav--next");

  lightboxEl.addEventListener("click", (event) => {
    if (event.target.closest(".edition-lightbox__image, .edition-lightbox__nav, .edition-lightbox__close")) {
      return;
    }

    if (
      event.target === lightboxEl
      || event.target.closest("[data-lightbox-close]")
      || event.target.closest(".edition-lightbox__dialog, .edition-lightbox__viewport, .edition-lightbox__figure")
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

function closeLightbox() {
  if (!lightboxEl) return;

  lightboxEl.classList.remove("is-open");
  document.body.classList.remove("edition-lightbox-open");
  unlockBodyScroll("edition-lightbox");
  lightboxEl.setAttribute("aria-hidden", "true");

  if (lightboxPreviouslyFocused && typeof lightboxPreviouslyFocused.focus === "function") {
    lightboxPreviouslyFocused.focus();
  }

  lightboxPreviouslyFocused = null;
}

function openLightbox(images, activeIndex = 0) {
  if (!isLightboxEnabled() || !Array.isArray(images) || images.length === 0) return;

  ensureLightbox();
  lightboxPreviouslyFocused = document.activeElement;
  lightboxImages = images;
  lightboxActiveIndex = normalizeLightboxIndex(activeIndex);
  updateLightbox();

  lightboxEl.classList.add("is-open");
  lightboxEl.setAttribute("aria-hidden", "false");
  document.body.classList.add("edition-lightbox-open");
  lockBodyScroll("edition-lightbox");

  requestAnimationFrame(() => {
    lightboxCloseEl?.focus();
  });
}

function handleLightboxViewportChange(event) {
  if (!event.matches) {
    closeLightbox();
  }
}

if (typeof lightboxMediaQuery.addEventListener === "function") {
  lightboxMediaQuery.addEventListener("change", handleLightboxViewportChange);
} else if (typeof lightboxMediaQuery.addListener === "function") {
  lightboxMediaQuery.addListener(handleLightboxViewportChange);
}

function renderEditionPrice(price, discountRate) {
  if (!priceEl) return;

  priceEl.replaceChildren();

  if (discountRate > 0) {
    const discounted = Math.round(price * (1 - discountRate / 100));

    const originalSpan = document.createElement("span");
    originalSpan.className = "shop-card__price--original";
    originalSpan.textContent = formatPrice(price);

    const discountedSpan = document.createElement("span");
    discountedSpan.className = "shop-card__price";
    discountedSpan.textContent = formatPrice(discounted);

    const badge = document.createElement("span");
    badge.className = "shop-card__discount";
    badge.textContent = `-${discountRate}%`;

    priceEl.append(originalSpan, discountedSpan, badge);
    return;
  }

  const priceSpan = document.createElement("span");
  priceSpan.className = "shop-card__price";
  priceSpan.textContent = formatPrice(price);
  priceEl.appendChild(priceSpan);
}

function syncStickyStop() {
  if (!sidebarTrackEl || !sidebarEl) return;

  if (window.innerWidth < 960) {
    sidebarTrackEl.style.removeProperty("height");
    return;
  }

  const mediaImages = mediaEl.querySelectorAll("img");
  const stickyHeight = Math.ceil(sidebarEl.offsetHeight);

  if (mediaImages.length === 0) {
    sidebarTrackEl.style.height = `${stickyHeight}px`;
    return;
  }

  const lastImage = mediaImages[mediaImages.length - 1];
  const stopOffset = Math.ceil(lastImage.offsetTop + stickyHeight);
  sidebarTrackEl.style.height = `${Math.max(stickyHeight, stopOffset)}px`;
}

function bindStickyStopUpdates() {
  if (!sidebarTrackEl || !sidebarEl) return;

  const mediaImages = mediaEl.querySelectorAll("img");
  for (const image of mediaImages) {
    if (image.complete) continue;
    image.addEventListener("load", syncStickyStop, { once: true });
  }

  window.addEventListener("resize", syncStickyStop);

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(syncStickyStop);
    observer.observe(mediaEl);
    observer.observe(sidebarEl);
  }

  requestAnimationFrame(syncStickyStop);
}

function markSold() {
  document.body.classList.add("is-sold");
  mediaEl.classList.add("is-sold");
  mediaEl.innerHTML = `<span class="edition-media__sold"></span>`;
  noteEl.textContent = "판매 완료된 에디션입니다. 다른 에디션을 확인해보세요.";
}

function renderTags(product) {
  const tags = getProductTags(product);
  tagsEl.innerHTML = "";

  if (tags.length === 0) return;

  for (const tag of tags) {
    const link = document.createElement("a");
    link.className = "edition-tag";
    link.href = `./shop?tag=${encodeURIComponent(tag)}`;
    link.textContent = tag;
    tagsEl.appendChild(link);
  }
}

function updateGalleryDots(dots, activeIndex) {
  dots.forEach((dot, index) => {
    const isActive = index === activeIndex;
    dot.classList.toggle("is-active", isActive);
    dot.setAttribute("aria-current", isActive ? "true" : "false");
  });
}

function bindGalleryDots(track, dots) {
  if (!track || dots.length === 0) return;

  let frameId = null;

  const sync = () => {
    frameId = null;
    const slideWidth = track.clientWidth || 1;
    const nextIndex = Math.max(0, Math.min(dots.length - 1, Math.round(track.scrollLeft / slideWidth)));
    updateGalleryDots(dots, nextIndex);
  };

  track.addEventListener("scroll", () => {
    if (frameId != null) return;
    frameId = requestAnimationFrame(sync);
  }, { passive: true });

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      track.scrollTo({
        left: track.clientWidth * index,
        behavior: "smooth",
      });
    });
  });

  if (!galleryResizeHandlerBound) {
    galleryResizeHandlerBound = true;
    window.addEventListener("resize", sync);
  }

  requestAnimationFrame(sync);
}

function renderMedia(product) {
  if (product.soldOut) {
    markSold();
    syncStickyStop();
    return;
  }

  const images = Array.isArray(product.images) ? product.images : [];
  mediaEl.classList.remove("is-sold");
  mediaEl.innerHTML = "";

  if (images.length === 0) {
    syncStickyStop();
    return;
  }

  const galleryItems = images.map((image, index) => ({
    pageUrl: index === 0
      ? imageUrl(image, { width: 1000, height: 1000 })
      : imageUrl(image, { width: 1000 }),
    lightboxUrl: imageUrl(image, { width: 1800 }),
    alt: index === 0 ? product.title : `${product.title} detail ${index}`,
  }));

  if (galleryItems.length === 1) {
    const mainImg = document.createElement("img");
    mainImg.src = galleryItems[0].pageUrl;
    mainImg.alt = galleryItems[0].alt;
    mainImg.draggable = false;
    mainImg.addEventListener("click", () => {
      openLightbox(
        galleryItems.map((item) => ({ url: item.lightboxUrl, alt: item.alt })),
        0,
      );
    });
    mediaEl.appendChild(mainImg);
    bindStickyStopUpdates();
    return;
  }

  const sliderEl = document.createElement("div");
  sliderEl.className = "edition-media__slider";

  const trackEl = document.createElement("div");
  trackEl.className = "edition-media__track";

  const dotsEl = document.createElement("div");
  dotsEl.className = "edition-media__dots";
  dotsEl.setAttribute("aria-label", "상품 이미지 선택");

  const lightboxItems = galleryItems.map((item) => ({ url: item.lightboxUrl, alt: item.alt }));
  const dots = [];

  galleryItems.forEach((item, index) => {
    const slideEl = document.createElement("div");
    slideEl.className = "edition-media__slide";

    const img = document.createElement("img");
    img.src = item.pageUrl;
    img.alt = item.alt;
    img.loading = index === 0 ? "eager" : "lazy";
    img.draggable = false;
    img.addEventListener("click", () => {
      openLightbox(lightboxItems, index);
    });

    slideEl.appendChild(img);
    trackEl.appendChild(slideEl);

    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = `edition-media__dot${index === 0 ? " is-active" : ""}`;
    dot.setAttribute("aria-label", `이미지 ${index + 1}`);
    dotsEl.appendChild(dot);
    dots.push(dot);
  });

  sliderEl.appendChild(trackEl);
  mediaEl.append(sliderEl, dotsEl);
  bindGalleryDots(trackEl, dots);

  bindStickyStopUpdates();
}

function toCheckoutWith(product) {
  addToCartSilent(product);
  window.location.href = "./checkout.html";
}

function renderRecommendations(allProducts, currentBaseName) {
  const grouped = new Map();

  for (const item of allProducts || []) {
    const { baseName } = parseProductTitle(item.title);
    if (baseName === currentBaseName) continue;
    if (!grouped.has(baseName)) grouped.set(baseName, []);
    grouped.get(baseName).push(item);
  }

  const recommendations = Array.from(grouped.values())
    .map((editions) => pickRepresentativeEdition(editions))
    .filter(Boolean)
    .slice(0, 4);
  recommendGridEl.innerHTML = "";

  for (const item of recommendations) {
    const { baseName } = parseProductTitle(item.title);
    const link = document.createElement("a");
    link.className = "edition-recommend-card";
    link.href = `./product?product=${encodeURIComponent(baseName)}`;

    const thumb = document.createElement("div");
    thumb.className = "edition-recommend-card__thumb";

    const firstImage = Array.isArray(item.images) && item.images.length > 0
      ? imageUrl(item.images[0], { width: 640, height: 640 })
      : null;

    if (firstImage) {
      const image = document.createElement("img");
      image.src = firstImage;
      image.alt = baseName;
      image.loading = "lazy";
      thumb.appendChild(image);
    }

    link.appendChild(thumb);
    recommendGridEl.appendChild(link);
  }
}

async function init() {
  try {
    const [product, allProducts] = await Promise.all([
      client.fetch(PRODUCT_BY_SLUG_QUERY, { slug }),
      client.fetch(ALL_PRODUCTS_QUERY),
    ]);

    if (!product) {
      titleEl.textContent = "상품을 찾을 수 없습니다";
      addBtn.style.display = "none";
      buyBtn.style.display = "none";
      return;
    }

    const { baseName, editionLabel } = parseProductTitle(product.title);
    const sold = !!product.soldOut;
    const tags = getProductTags(product);

    // Back link → product page for the base product
    backEl.href = `./product?product=${encodeURIComponent(baseName)}`;

    const canonicalUrl = toAbsoluteUrl(`edition?slug=${encodeURIComponent(slug)}`);
    const description = truncateDescription(getFirstParagraph(product.description || `${product.title} 상세 정보`));
    const primaryImageUrl = Array.isArray(product.images) && product.images.length > 0
      ? imageUrl(product.images[0], { width: 1200, height: 1200 })
      : null;

    document.title = `${product.title} | Oalum Shop`;
    kickerEl.textContent = tags[0] || "edition";
    titleEl.textContent = baseName;
    numberEl.textContent = editionLabel || product.title;
    descEl.textContent = product.description || "제품 정보";

    updatePageSeo({
      title: `${product.title} | Oalum Shop`,
      description,
      canonicalUrl,
      imageUrl: primaryImageUrl,
    });

    const productSchema = {
      "@type": "Product",
      name: product.title,
      description,
      url: canonicalUrl,
      brand: {
        "@type": "Brand",
        name: "Studio OALUM",
      },
      sku: product.slug?.current || slug,
      category: tags.join(", "),
      image: primaryImageUrl ? [primaryImageUrl] : undefined,
      offers: {
        "@type": "Offer",
        priceCurrency: "KRW",
        price: String(Number(product.price) || 0),
        availability: sold ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
        url: canonicalUrl,
      },
    };

    setJsonLd("edition-page", {
      "@context": "https://schema.org",
      "@graph": [
        productSchema,
        buildBreadcrumbList([
          { name: "Studio Oalum", url: toAbsoluteUrl("/") },
          { name: "Oalum Shop", url: toAbsoluteUrl("/shop") },
          { name: baseName, url: toAbsoluteUrl(`product?product=${encodeURIComponent(baseName)}`) },
          { name: product.title, url: canonicalUrl },
        ]),
      ],
    });

    renderTags(product);

    const price = Number(product.price) || 0;
    const discountRate = Number(product.discountRate) || 0;
    renderEditionPrice(price, discountRate);

    renderMedia(product);
    renderRecommendations(allProducts, baseName);

    if (sold) return;

    const cartItem = { ...product };
    addBtn.addEventListener("click", () => addToCart(cartItem));
    buyBtn.addEventListener("click", () => toCheckoutWith(cartItem));
  } catch (err) {
    console.error("Failed to load edition", err);
    titleEl.textContent = "상품 정보를 불러오지 못했습니다";
    addBtn.style.display = "none";
    buyBtn.style.display = "none";
  }
}
init();
