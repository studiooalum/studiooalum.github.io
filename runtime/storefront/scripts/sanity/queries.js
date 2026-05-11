
/* ===========================
   GROQ Queries for Sanity
   =========================== */

/** Fetch ALL published products (each edition = one document) */
export const ALL_PRODUCTS_QUERY = `
  *[_type == "product"] | order(_createdAt desc, title asc) {
    _id,
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
