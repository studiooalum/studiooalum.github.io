import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  computeFinalPrice,
  formatPrice,
  getFirstParagraph,
  groupProductsByBaseName,
  parseProductTitle,
} from "@/lib/catalog";
import { sanityFetch } from "@/lib/sanity/client";
import { getSanityImageUrl } from "@/lib/sanity/image";
import { ALL_PRODUCTS_QUERY } from "@/lib/sanity/queries";

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  return {
    title: `Product | ${resolvedParams.baseSlug} | Studio Oalum Storefront`,
  };
}

export default async function ProductPage({ params }) {
  const resolvedParams = await params;

  let allProducts = [];

  try {
    allProducts = await sanityFetch({
      query: ALL_PRODUCTS_QUERY,
      tags: ["product"],
    });
  } catch (error) {
    console.error("Failed to fetch product groups from Sanity", error);
  }

  const groups = groupProductsByBaseName(allProducts);
  const group = groups.find((item) => item.baseSlug === resolvedParams.baseSlug);

  if (!group) notFound();

  const representative = group.representative;
  const finalPrice = computeFinalPrice(representative);
  const basePrice = Number(representative?.price) || 0;
  const discountRate = Number(representative?.discountRate) || 0;
  const intro = getFirstParagraph(representative?.description || "상품 소개");

  return (
    <div className="page-stack">
      <section className="detail-hero">
        <Link href="/shop" className="back-link">
          Back to shop
        </Link>
        <div className="detail-hero__grid">
          <div className="detail-copy">
            <p className="kicker">Base product</p>
            <h1>{group.baseName}</h1>
            <p>{intro || "상품 소개가 아직 없습니다."}</p>
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
          </div>
          <div className="detail-sidebar">
            <p className="detail-kicker">Edition count</p>
            <p className="detail-sidebar__value">{group.editions.length}</p>
            <p className="detail-note">
              This route groups multiple edition documents under a single base product surface.
            </p>
          </div>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section__header">
          <p className="kicker">Available editions</p>
          <h2>Select an edition document</h2>
        </div>
        <div className="edition-list">
          {group.editions.map((edition) => {
            const { editionLabel } = parseProductTitle(edition.title);
            const previewImage = edition.images?.[0];
            const previewUrl = getSanityImageUrl(previewImage, { width: 720, height: 720 });
            const editionSlug = edition.slug?.current || "";

            return (
              <Link key={edition._id} href={`/edition/${editionSlug}`} className="edition-item">
                <div className="edition-item__thumb">
                  {previewUrl ? (
                    <Image
                      src={previewUrl}
                      alt={edition.title}
                      width={720}
                      height={720}
                      className="shop-card__image"
                    />
                  ) : (
                    <div className="shop-card__fallback">No image</div>
                  )}
                </div>
                <div className="edition-item__body">
                  <p className="eyebrow">{editionLabel || edition.title}</p>
                  <h3>{edition.soldOut ? "Sold out" : "Available"}</h3>
                  <p>{formatPrice(computeFinalPrice(edition))}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}