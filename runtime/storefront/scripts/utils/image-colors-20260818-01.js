function toChannel(value) {
  const channel = Number(value);
  return Number.isInteger(channel) && channel >= 0 && channel <= 255 ? channel : null;
}

export function normalizeImageRgb(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const hex = raw.match(/^#([\da-f]{6})$/i);
  if (hex) {
    return [0, 2, 4]
      .map((offset) => Number.parseInt(hex[1].slice(offset, offset + 2), 16))
      .join(", ");
  }

  const channels = raw.match(/^(?:rgb\()?\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*\)?$/i);
  if (!channels) return "";

  const normalized = channels.slice(1).map(toChannel);
  return normalized.every((channel) => channel !== null) ? normalized.join(", ") : "";
}

export function readAverageRgbFromImage(image) {
  if (!(image instanceof HTMLImageElement) || !image.naturalWidth || !image.naturalHeight) return "";

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return "";

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;

    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset + 3] < 32) continue;
      red += pixels[offset];
      green += pixels[offset + 1];
      blue += pixels[offset + 2];
      count += 1;
    }

    return count
      ? `${Math.round(red / count)}, ${Math.round(green / count)}, ${Math.round(blue / count)}`
      : "";
  } catch {
    return "";
  }
}

export async function readAverageRgbFromFile(file) {
  if (!(file instanceof Blob)) return "";

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", reject, { once: true });
    });
    image.src = objectUrl;
    await loaded;
    return readAverageRgbFromImage(image);
  } catch {
    return "";
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}