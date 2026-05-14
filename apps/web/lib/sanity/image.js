import { createImageUrlBuilder } from "@sanity/image-url";
import { dataset, projectId } from "./env";

const builder = createImageUrlBuilder({ projectId, dataset });

export function getSanityImageUrl(source, { width, height } = {}) {
  if (!source) return null;

  let chain = builder.image(source).auto("format").fit("max");

  if (width) chain = chain.width(width);
  if (height) chain = chain.height(height);

  return chain.url();
}