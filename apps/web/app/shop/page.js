import Image from "next/image";
import Link from "next/link";
import {
  computeFinalPrice,
  formatPrice,
  getProductTags,
  groupProductsByBaseName,
  normalizeShopTag,
} from "@/lib/catalog";
import { getSanityImageUrl } from "@/lib/sanity/image";
import { sanityFetch } from "@/lib/sanity/client";
import { ALL_PRODUCTS_QUERY } from "@/lib/sanity/queries";

export const metadata = {
  title: "Shop | Studio Oalum Storefront",
};

const SHOP_TAGS = [
  { value: "all", label: "all" },
  { value: "accessories", label: "accessories" },
  { value: "clothing", label: "clothing" },
  { value: "hat", label: "hat" },
  { value: "home", label: "home" },
];

export default async function ShopPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const activeTag = normalizeShopTag(resolvedSearchParams?.tag) || "all";

  let products = [];

  try {
    products = await sanityFetch({
      query: ALL_PRODUCTS_QUERY,
      tags: ["product"],
    });
  } catch (error) {
    console.error("Failed to fetch products from Sanity", error);
  }

  const filteredProducts =
    activeTag === "all"
      ? products
      : products.filter((product) => getProductTags(product).includes(activeTag));
  const groupedProducts = groupProductsByBaseName(filteredProducts);

  return (
    <div className="page-stack">
      <section className="section-banner">
        <p className="kicker">Sanity-powered shop</p>
        <h1>Current product data is now rendering from Sanity inside the Next storefront.</h1>
        <p>
          This route reads the same `product` documents that power the current runtime storefront.
          The checkout and payment flow still belong to the migration backlog, but catalog browsing
          no longer depends on static placeholder content here.
        </p>
        <div className="filter-row" aria-label="Product filters">
          {SHOP_TAGS.map((tag) => {
            const isActive = tag.value === activeTag;
            const href = tag.value === "all" ? "/shop" : `/shop?tag=${encodeURIComponent(tag.value)}`;

            return (
              <Link
                key={tag.value}
                href={href}
                className={isActive ? "filter-pill filter-pill--active" : "filter-pill"}
              >
                {tag.label}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="shop-grid" aria-label="Product groups">
        {groupedProducts.length === 0 ? (
          <article className="collection-card collection-card--empty">
            <h2>No products found</h2>
            <p className="collection-card__summary">
              Sanity returned no published products for this filter yet.
            </p>
          </article>
        ) : (
          groupedProducts.map((group) => {
            const previewImage = group.representative?.images?.[0];
            const previewUrl = getSanityImageUrl(previewImage, { width: 960, height: 960 });
            const basePrice = Number(group.representative?.price) || 0;
            const finalPrice = computeFinalPrice(group.representative);
            const discountRate = Number(group.representative?.discountRate) || 0;

            return (
              <Link key={group.baseSlug} href={`/product/${group.baseSlug}`} className="shop-card">
                <div className="shop-card__media">
                  {previewUrl ? (
                    <Image
                      src={previewUrl}
                      alt={group.baseName}
                      width={960}
                      height={960}
                      className="shop-card__image"
                    />
                  ) : (
                    <div className="shop-card__fallback">No image</div>
                  )}
                </div>
                <div className="shop-card__body">
                  <p className="eyebrow">{group.editions.length} editions</p>
                  <h2>{group.baseName}</h2>
                  <div className="price-row">
                    {discountRate > 0 ? (
                      <>
                        <span className="price-row__original">{formatPrice(basePrice)}</span>
                        <span>{formatPrice(finalPrice)}</span>
                        <span className="status-chip">-{discountRate}%</span>
                      </>
                    ) : (
                      <span>{formatPrice(finalPrice)}</span>
                    )}
                  </div>
                  <div className="tag-row">
                    {group.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="tag-pill">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </section>
    </div>
  );
}