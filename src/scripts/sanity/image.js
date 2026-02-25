export function imageUrl(image, { width, height } = {}) {
  const base = image?.asset?.url;
  if (!base) return null;

  const url = new URL(base);
  if (width) url.searchParams.set('w', String(width));
  if (height) url.searchParams.set('h', String(height));
  url.searchParams.set('fit', 'max');
  url.searchParams.set('auto', 'format');
  return url.toString();
}
