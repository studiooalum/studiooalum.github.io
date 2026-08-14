export const ALL_PRODUCTS_QUERY = `
  *[_type == "product"] | order(title asc) {
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

export const ALL_ARCHIVES_QUERY = `
  *[_type == "archive"] | order(createdDate desc) {
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
          }
        }
      }
    }
  }
`;

export const ARCHIVE_BY_ID_QUERY = `
  *[_type == "archive" && _id == $id][0] {
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
          }
        }
      }
    }
  }
`;