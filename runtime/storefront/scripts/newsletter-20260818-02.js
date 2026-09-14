import { lockBodyScroll, unlockBodyScroll } from "./utils/scroll-lock.js";

export { initNewsletterForm } from "./newsletter-20260817-05.js";

let lightboxElement = null;
let lightboxImageElement = null;
let lightboxCloseElement = null;
let lightboxPreviousElement = null;
let lightboxNextElement = null;
let lightboxImages = [];
let lightboxIndex = 0;
let lightboxPreviouslyFocused = null;

function normalizeLightboxIndex(index) {
  if (!lightboxImages.length) return 0;
  return (index + lightboxImages.length) % lightboxImages.length;
}

function updateLightbox() {
  const image = lightboxImages[lightboxIndex];
  if (!lightboxImageElement || !image) return;
  lightboxImageElement.src = image.src;
  lightboxImageElement.alt = image.alt || "뉴스레터 이미지";
  const hasMultipleImages = lightboxImages.length > 1;
  lightboxPreviousElement?.toggleAttribute("hidden", !hasMultipleImages);
  lightboxNextElement?.toggleAttribute("hidden", !hasMultipleImages);

  if (hasMultipleImages) {
    [lightboxIndex - 1, lightboxIndex + 1].forEach((nextIndex) => {
      const preload = new Image();
      preload.src = lightboxImages[normalizeLightboxIndex(nextIndex)]?.src || "";
    });
  }
}

function stepLightbox(offset) {
  if (lightboxImages.length < 2) return;
  lightboxIndex = normalizeLightboxIndex(lightboxIndex + offset);
  updateLightbox();
}

function closeLightbox() {
  if (!lightboxElement) return;
  lightboxElement.classList.remove("is-open");
  lightboxElement.setAttribute("aria-hidden", "true");
  document.body.classList.remove("newsletter-lightbox-open");
  unlockBodyScroll("newsletter-lightbox");
  lightboxPreviouslyFocused?.focus?.();
  lightboxPreviouslyFocused = null;
}

function ensureLightbox() {
  if (lightboxElement) return;
  lightboxElement = document.createElement("div");
  lightboxElement.className = "newsletter-lightbox";
  lightboxElement.setAttribute("aria-hidden", "true");
  lightboxElement.innerHTML = `
    <div class="newsletter-lightbox__backdrop" data-newsletter-lightbox-close="true"></div>
    <div class="newsletter-lightbox__dialog" role="dialog" aria-modal="true" aria-label="뉴스레터 이미지 확대 보기">
      <button type="button" class="newsletter-lightbox__nav newsletter-lightbox__nav--prev" aria-label="이전 이미지">
        <span aria-hidden="true">&lt;</span>
      </button>
      <div class="newsletter-lightbox__viewport">
        <figure class="newsletter-lightbox__figure">
          <img class="newsletter-lightbox__image" data-progressive-image="false" alt="">
        </figure>
      </div>
      <button type="button" class="newsletter-lightbox__nav newsletter-lightbox__nav--next" aria-label="다음 이미지">
        <span aria-hidden="true">&gt;</span>
      </button>
      <button type="button" class="newsletter-lightbox__close" aria-label="확대 이미지 닫기"></button>
    </div>
  `;
  document.body.append(lightboxElement);
  lightboxImageElement = lightboxElement.querySelector(".newsletter-lightbox__image");
  lightboxCloseElement = lightboxElement.querySelector(".newsletter-lightbox__close");
  lightboxPreviousElement = lightboxElement.querySelector(".newsletter-lightbox__nav--prev");
  lightboxNextElement = lightboxElement.querySelector(".newsletter-lightbox__nav--next");

  lightboxElement.addEventListener("click", (event) => {
    if (event.target.closest(".newsletter-lightbox__image, .newsletter-lightbox__nav, .newsletter-lightbox__close")) return;
    if (event.target.closest("[data-newsletter-lightbox-close], .newsletter-lightbox__viewport")) closeLightbox();
  });
  lightboxCloseElement?.addEventListener("click", closeLightbox);
  lightboxPreviousElement?.addEventListener("click", () => stepLightbox(-1));
  lightboxNextElement?.addEventListener("click", () => stepLightbox(1));
  window.addEventListener("keydown", (event) => {
    if (!lightboxElement?.classList.contains("is-open")) return;
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") stepLightbox(-1);
    if (event.key === "ArrowRight") stepLightbox(1);
  });
}

function openLightbox(images, activeIndex) {
  if (!images.length) return;
  ensureLightbox();
  lightboxImages = images;
  lightboxIndex = normalizeLightboxIndex(activeIndex);
  lightboxPreviouslyFocused = document.activeElement;
  updateLightbox();
  lightboxElement.classList.add("is-open");
  lightboxElement.setAttribute("aria-hidden", "false");
  document.body.classList.add("newsletter-lightbox-open");
  lockBodyScroll("newsletter-lightbox");
  requestAnimationFrame(() => lightboxCloseElement?.focus());
}

function enhanceEntryImages(content) {
  const imageElements = Array.from(content.querySelectorAll("img")).filter((image) => image.getAttribute("src"));
  const images = imageElements.map((image) => ({
    src: image.currentSrc || image.getAttribute("src") || "",
    alt: image.getAttribute("alt") || "",
  }));

  imageElements.forEach((image, index) => {
    image.dataset.newsletterZoom = "true";
    image.tabIndex = 0;
    image.setAttribute("role", "button");
    image.setAttribute("aria-label", `${image.alt || "뉴스레터 이미지"} 확대 보기`);
    image.addEventListener("click", () => openLightbox(images, index));
    image.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openLightbox(images, index);
    });
  });
}

function formatPublishedDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

async function requestNewsletter(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "뉴스레터를 불러오지 못했습니다.");
  }
  return payload;
}

function getPostCategories(post) {
  const categories = Array.isArray(post.categories)
    ? post.categories.map((category) => String(category || "").trim()).filter(Boolean)
    : [];
  return categories.length ? categories : ["notes"];
}

function createCategoryLink(category, className = "shop-tag") {
  const link = document.createElement("a");
  link.className = className;
  link.href = `./newsletter.html?category=${encodeURIComponent(category)}`;
  link.textContent = category;
  return link;
}

function createPostCard(post) {
  const card = document.createElement("article");
  card.className = "newsletter-post-card";
  const postHref = `./newsletter.html?slug=${encodeURIComponent(post.slug)}`;
  const [category] = getPostCategories(post);

  if (post.coverImageUrl) {
    const media = document.createElement("a");
    media.className = "newsletter-post-card__media";
    media.href = postHref;
    media.setAttribute("aria-label", `${post.title || "뉴스레터"} 읽기`);
    const image = document.createElement("img");
    image.className = "newsletter-post-card__image";
    image.src = post.coverImageUrl;
    image.alt = post.coverImageAlt || "";
    media.append(image);
    card.append(media);
  }

  const body = document.createElement("div");
  body.className = "newsletter-post-card__body";
  const metaRow = document.createElement("div");
  metaRow.className = "newsletter-post-card__meta-row";
  const date = document.createElement("p");
  date.className = "newsletter-entry__meta";
  date.textContent = formatPublishedDate(post.publishedAt);
  const categoryLink = createCategoryLink(category, "newsletter-post-card__category");
  metaRow.append(date, categoryLink);

  const titleLink = document.createElement("a");
  titleLink.className = "newsletter-post-card__title-link";
  titleLink.href = postHref;
  const title = document.createElement("h2");
  title.className = "newsletter-post-card__title";
  title.textContent = post.title || "뉴스레터";
  titleLink.append(title);
  body.append(metaRow, titleLink);
  card.append(body);
  return card;
}

function renderCategoryTags(posts, selectedCategory) {
  const container = document.getElementById("newsletterTags");
  if (!container) return;

  const categories = ["all", ...new Set(posts.flatMap((post) => Array.isArray(post.categories) ? post.categories : []))];
  const fragment = document.createDocumentFragment();

  categories.forEach((category) => {
    const link = document.createElement("a");
    link.className = `shop-tag${category === selectedCategory ? " is-active" : ""}`;
    link.href = category === "all" ? "./newsletter.html" : `./newsletter.html?category=${encodeURIComponent(category)}`;
    link.textContent = category;
    fragment.append(link);
  });

  container.replaceChildren(fragment);
}

function renderPostEntry(container, post) {
  if (!container) return;
  container.innerHTML = "";

  const back = document.createElement("a");
  back.className = "newsletter-entry__back";
  back.href = "./newsletter.html";
  back.textContent = "←";
  back.setAttribute("aria-label", "모든 Newsletter 글로 돌아가기");

  const meta = document.createElement("p");
  meta.className = "newsletter-entry__meta";
  meta.textContent = formatPublishedDate(post.publishedAt);
  const title = document.createElement("h2");
  title.className = "newsletter-entry__title";
  title.textContent = post.title || "뉴스레터";
  const excerpt = document.createElement("p");
  excerpt.className = "newsletter-entry__excerpt";
  excerpt.textContent = post.excerpt || "";
  const tags = document.createElement("div");
  tags.className = "newsletter-entry__tags";
  getPostCategories(post).forEach((category) => tags.append(createCategoryLink(category)));
  const content = document.createElement("div");
  content.className = "newsletter-entry__content";
  content.innerHTML = post.contentHtml || "";
  enhanceEntryImages(content);
  container.append(back, meta, title, excerpt, tags, content);
}

export async function initNewsletterPage() {
  const status = document.getElementById("newsletterFeedStatus");
  const list = document.getElementById("newsletterPostList");
  const entry = document.getElementById("newsletterPostEntry");
  if (!status || !list || !entry) return;

  status.hidden = true;
  status.textContent = "";

  const slug = String(new URLSearchParams(window.location.search).get("slug") || "").trim();
  const selectedCategory = String(new URLSearchParams(window.location.search).get("category") || "all").trim().toLowerCase();

  try {
    if (slug) {
      document.body.classList.add("newsletter-entry-mode");
      const payload = await requestNewsletter(`./api/newsletters?slug=${encodeURIComponent(slug)}`);
      if (!payload.post) {
        status.hidden = false;
        status.textContent = "요청한 글을 찾을 수 없습니다.";
        return;
      }
      renderPostEntry(entry, payload.post);
      entry.hidden = false;
      list.hidden = true;
      status.hidden = true;
      return;
    }

    const payload = await requestNewsletter("./api/newsletters");
    const posts = Array.isArray(payload.posts) ? payload.posts : [];
    renderCategoryTags(posts, selectedCategory);
    list.innerHTML = "";
    const visiblePosts = selectedCategory === "all" ? posts : posts.filter((post) => post.categories?.includes(selectedCategory));
    if (!visiblePosts.length) {
      status.hidden = false;
      status.textContent = "아직 발행된 뉴스레터가 없습니다.";
      return;
    }
    visiblePosts.forEach((post) => list.appendChild(createPostCard(post)));
    status.hidden = true;
  } catch (error) {
    status.hidden = false;
    status.textContent = error.message || "뉴스레터를 불러오지 못했습니다.";
  }
}
