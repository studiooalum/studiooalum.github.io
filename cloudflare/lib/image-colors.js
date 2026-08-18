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