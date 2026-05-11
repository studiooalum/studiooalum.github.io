
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

/** Fetch published workshops for the live workshops page */
export const ALL_WORKSHOPS_QUERY = `
  *[_type == "workshop"] | order(_createdAt desc, title asc) {
    _id,
    title,
    "slug": slug.current,
    description,
    summary,
    excerpt,
    duration,
    durationLabel,
    category,
    workshopCategory,
    levelLabel,
    audienceLabel,
    maxCapacity,
    capacityLabel,
    materials,
    thingsToBring,
    locationName,
    locationAddress,
    locationDetail,
    hostName,
    price,
    bookingNotice,
    bookingUrl,
    externalUrl,
    link,
    poster {
      asset->{url}
    },
    posterImage {
      asset->{url}
    },
    mainImage {
      asset->{url}
    },
    images[]{
      asset->{url}
    }
  }
`;

export const WORKSHOP_BY_SLUG_QUERY = `
  *[_type == "workshop" && slug.current == $slug][0] {
    _id,
    title,
    "slug": slug.current,
    description,
    summary,
    excerpt,
    duration,
    durationLabel,
    category,
    workshopCategory,
    levelLabel,
    audienceLabel,
    maxCapacity,
    capacityLabel,
    materials,
    thingsToBring,
    locationName,
    locationAddress,
    locationDetail,
    hostName,
    price,
    bookingNotice,
    bookingUrl,
    externalUrl,
    link,
    poster {
      asset->{url}
    },
    posterImage {
      asset->{url}
    },
    mainImage {
      asset->{url}
    },
    images[]{
      asset->{url}
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
