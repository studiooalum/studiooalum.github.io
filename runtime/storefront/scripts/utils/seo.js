const SITE_ORIGIN = "https://studiooalum.com";

function upsertHeadElement(selector, createElement) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = createElement();
    document.head.appendChild(element);
  }
  return element;
}

function setMetaByName(name, content) {
  const element = upsertHeadElement(`meta[name="${name}"]`, () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", name);
    return meta;
  });
  element.setAttribute("content", content);
}

function setMetaByProperty(property, content) {
  const element = upsertHeadElement(`meta[property="${property}"]`, () => {
    const meta = document.createElement("meta");
    meta.setAttribute("property", property);
    return meta;
  });
  element.setAttribute("content", content);
}

export function toAbsoluteUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return SITE_ORIGIN;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return `${SITE_ORIGIN}${raw}`;
  return `${SITE_ORIGIN}/${raw.replace(/^\.\//, "")}`;
}

export function truncateDescription(value, maxLength = 155) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function updatePageSeo({ title, description, canonicalUrl, imageUrl } = {}) {
  if (title) {
    document.title = title;
    setMetaByProperty("og:title", title);
    setMetaByName("twitter:title", title);
  }

  if (description) {
    setMetaByName("description", description);
    setMetaByProperty("og:description", description);
    setMetaByName("twitter:description", description);
  }

  if (canonicalUrl) {
    const canonical = upsertHeadElement('link[rel="canonical"]', () => {
      const link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      return link;
    });
    canonical.setAttribute("href", canonicalUrl);
    setMetaByProperty("og:url", canonicalUrl);
  }

  if (imageUrl) {
    setMetaByProperty("og:image", imageUrl);
    setMetaByName("twitter:image", imageUrl);
    setMetaByName("twitter:card", "summary_large_image");
  }
}

export function setJsonLd(id, payload) {
  const element = upsertHeadElement(`script[data-oalum-jsonld="${id}"]`, () => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.oalumJsonld = id;
    return script;
  });

  element.textContent = JSON.stringify(payload);
}

export function buildBreadcrumbList(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
