import client from "./sanity/client.js?v=20260520-03";
import { ALL_PRODUCTS_QUERY } from "./sanity/queries.js";
import { imageUrl } from "./sanity/image.js";
import { getFirstParagraph, parseProductTitle, pickRepresentativeEdition } from "./utils/catalog.js";
import { buildBreadcrumbList, setJsonLd, toAbsoluteUrl, truncateDescription, updatePageSeo } from "./utils/seo.js";

const params = new URLSearchParams(window.location.search);
const productName = params.get("product");

function getShopPath() {
  return "./shop";
}

function getEditionPath(slug) {
  const encoded = encodeURIComponent(slug || "");
  return `./edition?slug=${encoded}`;
}

if (!productName) window.location.href = getShopPath();

const titleEl = document.getElementById("productTitle");
const introEl = document.getElementById("productIntro");
const metaEl = document.getElementById("productMeta");
const gridEl = document.getElementById("editionGrid");
const backEl = document.getElementById("productBack");
const editionCollator = new Intl.Collator("ko-KR", { numeric: true, sensitivity: "base" });

function sortEditionsForProduct(editions) {
  return [...editions].sort((left, right) => {
    const leftLabel = parseProductTitle(left.title).editionLabel || left.title || "";
    const rightLabel = parseProductTitle(right.title).editionLabel || right.title || "";
    return editionCollator.compare(leftLabel, rightLabel);
  });
}

function renderEditionGrid(editions) {
  const representative = pickRepresentativeEdition(editions);
  if (!representative) return;
  const price = Number(representative.price) || 0;
  const discountRate = Number(representative.discountRate) || 0;
  const displayPrice = Number(price).toLocaleString("ko-KR");
  const primaryImageUrl = Array.isArray(representative.images) && representative.images.length > 0
    ? imageUrl(representative.images[0], { width: 1200, height: 1200 })
    : null;
  const description = truncateDescription(
    `${productName} 시리즈의 에디션을 한 페이지에서 살펴보세요. ${getFirstParagraph(representative.description || "")}`,
  );
  const canonicalUrl = toAbsoluteUrl(`product?product=${encodeURIComponent(productName)}`);

  document.title = `${productName} | 오알룸 샵 | 스튜디오 오알룸`;
  titleEl.textContent = productName;
  introEl.textContent = getFirstParagraph(representative.description || "상품 소개");

  updatePageSeo({
    title: `${productName} | 오알룸 샵 | 스튜디오 오알룸`,
    description,
    canonicalUrl,
    imageUrl: primaryImageUrl,
    robots: "index,follow",
  });

  setJsonLd("product-page", {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: `${productName} | 오알룸 샵`,
        description,
        url: canonicalUrl,
        mainEntity: {
          "@type": "ItemList",
          itemListElement: editions.map((edition, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: edition.title,
            url: toAbsoluteUrl(`edition?slug=${encodeURIComponent(edition.slug?.current || "")}`),
          })),
        },
      },
      buildBreadcrumbList([
        { name: "오알룸", url: toAbsoluteUrl("/") },
        { name: "오알룸 샵", url: toAbsoluteUrl("/shop") },
        { name: productName, url: canonicalUrl },
      ]),
    ],
  });

  if (discountRate > 0) {
    const discounted = Math.round(price * (1 - discountRate / 100));
    const discountedLabel = Number(discounted).toLocaleString("ko-KR");
    metaEl.innerHTML = `<span class="product-meta__item">총 ${editions.length}개 개당 ￦${discountedLabel} (${discountRate}%할인)</span>`;
  } else {
    metaEl.innerHTML = `<span class="product-meta__item">총 ${editions.length}개 개당 ￦${displayPrice}</span>`;
  }

  gridEl.innerHTML = "";

  for (const edition of editions) {
    const { editionLabel } = parseProductTitle(edition.title);
    const slug = edition.slug?.current || "";
    const sold = !!edition.soldOut;

    const link = document.createElement("a");
    link.className = sold ? "edition-card is-sold" : "edition-card";
    link.href = getEditionPath(slug);
    link.setAttribute("aria-label", editionLabel || edition.title);

    const thumb = document.createElement("div");
    thumb.className = "edition-card__thumb";

    if (!sold) {
      const firstImage =
        Array.isArray(edition.images) && edition.images.length > 0
          ? imageUrl(edition.images[0], { width: 720, height: 720 })
          : null;

      if (firstImage) {
        const img = document.createElement("img");
        img.src = firstImage;
        img.alt = editionLabel || edition.title;
        img.loading = "lazy";
        img.draggable = false;
        thumb.appendChild(img);
      } else {
        const empty = document.createElement("span");
        empty.className = "edition-card__sold";
        empty.textContent = "IMAGE";
        thumb.appendChild(empty);
      }
    }

    const no = document.createElement("div");
    no.className = "edition-card__no";
    no.textContent = editionLabel || edition.title;

    link.appendChild(thumb);
    link.appendChild(no);
    gridEl.appendChild(link);
  }
}

async function init() {
  try {
    gridEl.innerHTML = `<p class="product-state">Loading editions...</p>`;
    const allProducts = await client.fetch(ALL_PRODUCTS_QUERY);
    const editions = (allProducts || []).filter((p) => {
      const { baseName } = parseProductTitle(p.title);
      return baseName === productName;
    });
    const sortedEditions = sortEditionsForProduct(editions);

    if (backEl) {
      backEl.href = `./shop`;
    }

    if (sortedEditions.length === 0) {
      gridEl.innerHTML = `<p class="product-state">상품을 찾을 수 없습니다.</p>`;
      return;
    }
    renderEditionGrid(sortedEditions);
  } catch (err) {
    console.error("Failed to load product editions", err);
    gridEl.innerHTML = `<p class="product-state">상품을 불러오지 못했습니다.</p>`;
  }
}

init();