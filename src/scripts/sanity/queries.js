
/* ===========================
   GROQ Queries for Sanity
   =========================== */

/** Fetch ALL published products — the rug grid adapts to however many exist */
export const ALL_PRODUCTS_QUERY = `
  *[_type == "product"] | order(_createdAt asc) {
    _id,
    title,
    description,
    price,
    soldOut,
    slug,
    images[]{
      asset->{url}
    }
  }
`;

/** Fetch a single product by slug (for product detail page) */
export const PRODUCT_BY_SLUG_QUERY = `
  *[_type == "product" && slug.current == $slug][0] {
    _id,
    title,
    description,
    price,
    soldOut,
    slug,
    category,
    images[]{
      asset->{url}
    }
  }
`;
