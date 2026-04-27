import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  computeFinalPrice,
  formatPrice,
  getProductTags,
  groupProductsByBaseName,
  parseProductTitle,
} from "@/lib/catalog";
import { sanityFetch } from "@/lib/sanity/client";
import { getSanityImageUrl } from "@/lib/sanity/image";
import { ALL_PRODUCTS_QUERY, PRODUCT_BY_SLUG_QUERY } from "@/lib/sanity/queries";
import EditionPurchasePanel from "./EditionPurchasePanel";

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  return {
    title: `Edition | ${resolvedParams.slug} | Studio Oalum Storefront`,
  };
}

export default async function EditionPage({ params }) {
  const resolvedParams = await params;

  let product = null;
  let allProducts = [];

  try {
    [product, allProducts] = await Promise.all([
      sanityFetch({
        query: PRODUCT_BY_SLUG_QUERY,
        params: { slug: resolvedParams.slug },
        tags: [`product:${resolvedParams.slug}`],
      }),
      sanityFetch({
        query: ALL_PRODUCTS_QUERY,
        tags: ["product"],
      }),
    ]);
  } catch (error) {
    console.error("Failed to fetch edition data from Sanity", error);
  }

  if (!product) notFound();

  const { baseName, editionLabel } = parseProductTitle(product.title);
  const productGroups = groupProductsByBaseName(allProducts);
  const recommendations = productGroups.filter((item) => item.baseName !== baseName).slice(0, 3);
  const currentGroup = productGroups.find((item) => item.baseName === baseName);
  const tags = getProductTags(product);
  const finalPrice = computeFinalPrice(product);
  const basePrice = Number(product.price) || 0;
  const discountRate = Number(product.discountRate) || 0;
  const gallery = Array.isArray(product.images) ? product.images : [];
  const previewImageUrl = getSanityImageUrl(gallery[0], { width: 720, height: 720 }) || "";
  const commerceProduct = {
    lineId: product._id,
    productId: product._id,
    title: product.title,
    slug: product.slug?.current || resolvedParams.slug,
    editionLabel: editionLabel || product.title,
    imageUrl: previewImageUrl,
    price: finalPrice,
    soldOut: !!product.soldOut,
  };

  return (
    <div className="page-stack">
      <section className="detail-hero">
        <Link href={`/product/${currentGroup?.baseSlug || ""}`} className="back-link">
          Back to product
        </Link>
        <div className="detail-hero__grid">
          <div className="detail-copy">
            <p className="kicker">Edition detail</p>
            <h1>{baseName}</h1>
            <p className="detail-copy__subhead">{editionLabel || product.title}</p>
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
            {product.size ? <p className="detail-note">Size: {product.size}</p> : null}
            <p>{product.description || "제품 설명이 아직 없습니다."}</p>
            <div className="detail-tag-row">
              {tags.map((tag) => (
                <Link key={tag} href={`/shop?tag=${encodeURIComponent(tag)}`} className="tag-pill">
                  {tag}
                </Link>
              ))}
            </div>
          </div>
          <div className="detail-sidebar">
            <p className="detail-kicker">Commerce note</p>
            <p className="detail-note">
              This edition now connects to a local cart, order creation route, and preview payment confirmation route inside `apps/web`.
            </p>
            <EditionPurchasePanel product={commerceProduct} />
          </div>
        </div>
      </section>

      <section className="detail-media-grid">
        {gallery.length === 0 ? (
          <div className="detail-media-card detail-media-card--empty">No product media</div>
        ) : (
          gallery.map((image, index) => {
            const imageUrl = getSanityImageUrl(image, { width: 1400 });
            if (!imageUrl) return null;

            return (
              <div key={`${image?.asset?._id || imageUrl}-${index}`} className="detail-media-card">
                <Image
                  src={imageUrl}
                  alt={`${product.title} image ${index + 1}`}
                  width={1400}
                  height={1400}
                  className="detail-media-card__image"
                />
              </div>
            );
          })
        )}
      </section>

      <section className="detail-section">
        <div className="detail-section__header">
          <p className="kicker">Recommended next</p>
          <h2>Other base products from the same catalog</h2>
        </div>
        <div className="recommend-grid">
          {recommendations.map((group) => {
            const previewImage = group.representative?.images?.[0];
            const previewUrl = getSanityImageUrl(previewImage, { width: 720, height: 720 });

            return (
              <Link key={group.baseSlug} href={`/product/${group.baseSlug}`} className="recommend-card">
                <div className="recommend-card__thumb">
                  {previewUrl ? (
                    <Image
                      src={previewUrl}
                      alt={group.baseName}
                      width={720}
                      height={720}
                      className="shop-card__image"
                    />
                  ) : (
                    <div className="shop-card__fallback">No image</div>
                  )}
                </div>
                <div className="recommend-card__body">
                  <h3>{group.baseName}</h3>
                  <p>{group.editions.length} editions</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}