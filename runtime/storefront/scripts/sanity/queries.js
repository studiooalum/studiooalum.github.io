
/* ===========================
   GROQ Queries for Sanity
   =========================== */

/** Fetch ALL published products (each edition = one document) */
export const ALL_PRODUCTS_QUERY = `
  *[_type == "product"] | order(_createdAt desc, title asc) {
    _id,
    isRepresentative,
    title,
    description,
    price,
    discountRate,
    soldOut,
    slug,
    category,
    shopTags,
    images[]{
      asset->{url}
    }
  }
`;

/** Fetch a single product/edition by slug */
export const PRODUCT_BY_SLUG_QUERY = `
  *[_type == "product" && slug.current == $slug][0] {
    _id,
    isRepresentative,
    title,
    description,
    size,
    price,
    discountRate,
    soldOut,
    slug,
    category,
    shopTags,
    images[]{
      asset->{url}
    }
  }
`;

export const ARCHIVE_QUERY = `
  *[_type == "archive"] | order(createdDate desc, _createdAt desc) {
    _id,
    title,
    material,
    createdDate,
    size,
    description,
    tags,
    images[]{
      asset->{
        _id,
        url,
        metadata {
          dimensions {
            width,
            height
          },
          palette {
            dominant {
              background
            }
          }
        }
      }
    },
    scheduleSlots[]{
      _key,
      label,
      date,
      startTime,
      endTime,
      capacity,
      isBlocked,
      status,
      reason
    }
  }
`;
