export function initNewsletterForm() {
  const form = document.getElementById("newsletterForm");
  const status = document.getElementById("newsletterFormStatus");

  if (!form || !status) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const agreed = formData.get("agree") === "on";

    status.classList.remove("is-error", "is-success");

    if (!email) {
      status.textContent = "이메일을 입력해주세요.";
      status.classList.add("is-error");
      return;
    }

    if (!agreed) {
      status.textContent = "수신 동의 후 신청할 수 있습니다.";
      status.classList.add("is-error");
      return;
    }

    status.textContent = `${name || "구독자"}님, 구독 기능을 준비하고 있습니다.`;
    status.classList.add("is-success");
    form.reset();
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

function createPostCard(post) {
  const link = document.createElement("a");
  link.className = "newsletter-post-card";
  link.href = `./newsletter.html?slug=${encodeURIComponent(post.slug)}`;

  if (post.coverImageUrl) {
    const image = document.createElement("img");
    image.className = "newsletter-post-card__image";
    image.src = post.coverImageUrl;
    image.alt = post.coverImageAlt || "";
    link.appendChild(image);
  }

  const body = document.createElement("div");
  body.className = "newsletter-post-card__body";
  const date = document.createElement("p");
  date.className = "newsletter-entry__meta";
  date.textContent = formatPublishedDate(post.publishedAt);
  const title = document.createElement("h2");
  title.className = "newsletter-post-card__title";
  title.textContent = post.title || "뉴스레터";
  const excerpt = document.createElement("p");
  excerpt.className = "newsletter-entry__excerpt";
  excerpt.textContent = post.excerpt || "";
  body.append(date, title, excerpt);
  link.appendChild(body);
  return link;
}

function renderPostEntry(container, post) {
  if (!container) return;
  container.innerHTML = "";

  const back = document.createElement("a");
  back.className = "newsletter-entry__back";
  back.href = "./newsletter.html";
  back.textContent = "← 모든 글";
  container.appendChild(back);

  if (post.coverImageUrl) {
    const cover = document.createElement("img");
    cover.className = "newsletter-entry__cover";
    cover.src = post.coverImageUrl;
    cover.alt = post.coverImageAlt || "";
    container.appendChild(cover);
  }

  const meta = document.createElement("p");
  meta.className = "newsletter-entry__meta";
  meta.textContent = formatPublishedDate(post.publishedAt);
  const title = document.createElement("h2");
  title.className = "newsletter-entry__title";
  title.textContent = post.title || "뉴스레터";
  const excerpt = document.createElement("p");
  excerpt.className = "newsletter-entry__excerpt";
  excerpt.textContent = post.excerpt || "";
  const content = document.createElement("div");
  content.className = "newsletter-entry__content";
  content.innerHTML = post.contentHtml || "";
  container.append(meta, title, excerpt, content);
}

export async function initNewsletterPage() {
  const status = document.getElementById("newsletterFeedStatus");
  const list = document.getElementById("newsletterPostList");
  const entry = document.getElementById("newsletterPostEntry");
  if (!status || !list || !entry) return;

  const slug = String(new URLSearchParams(window.location.search).get("slug") || "").trim();

  try {
    if (slug) {
      const payload = await requestNewsletter(`./api/newsletters?slug=${encodeURIComponent(slug)}`);
      if (!payload.post) {
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
    list.innerHTML = "";
    if (!posts.length) {
      status.textContent = "아직 발행된 뉴스레터가 없습니다.";
      return;
    }
    posts.forEach((post) => list.appendChild(createPostCard(post)));
    status.hidden = true;
  } catch (error) {
    status.textContent = error.message || "뉴스레터를 불러오지 못했습니다.";
  }
}