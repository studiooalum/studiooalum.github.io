export const ALL_PRODUCTS_QUERY = `
  *[_type == "product"] | order(title asc) {
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
      asset->{
        _id,
        url,
        metadata {
          dimensions {
            width,
            height
          }
        }
      }
    }
  }
`;

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
      asset->{
        _id,
        url,
        metadata {
          dimensions {
            width,
            height
          }
        }
      }
    }
  }
`;