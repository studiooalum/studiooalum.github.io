import { MAX_REPAIR_PHOTOS, MAX_REPAIR_PHOTO_BYTES, REPAIR_PHOTO_LIMIT_TEXT } from "../../../shared/repair-photo-policy.js";

const MAX_EDGE = 3200;
const TARGET_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const HEIC_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);

export function isHeicPhoto(file) {
  return HEIC_TYPES.has(String(file.type || "").toLowerCase()) || /\.hei[cf]$/i.test(file.name || "");
}

export function validateRepairPhotos(files) {
  if (files.length > MAX_REPAIR_PHOTOS) throw new Error(REPAIR_PHOTO_LIMIT_TEXT);
  for (const file of files) {
    if (!file.size) throw new Error(`${file.name}: 사진 파일이 비어 있습니다.`);
    if (file.size > MAX_REPAIR_PHOTO_BYTES) throw new Error(REPAIR_PHOTO_LIMIT_TEXT);
    if (!isHeicPhoto(file) && !IMAGE_TYPES.has(String(file.type || "").toLowerCase()) && !/\.(jpe?g|png|webp|avif)$/i.test(file.name || "")) {
      throw new Error("JPG, PNG, WEBP, AVIF, HEIC 사진을 선택해주세요.");
    }
  }
}

async function loadNativeImage(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("사진을 읽지 못했습니다."));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("사진을 읽지 못했습니다.");
    return { image, width: image.naturalWidth, height: image.naturalHeight, release: () => { image.src = ""; URL.revokeObjectURL(url); } };
  } catch (error) {
    image.src = "";
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function decodePhoto(file) {
  try {
    // Safari can decode HEIC natively and applies the photo's orientation.
    return await loadNativeImage(file);
  } catch (error) {
    if (!isHeicPhoto(file)) throw error;
    // Load the local decoder only when the browser needs HEIC support.
    const { decodeHeicPhoto } = await import("./repair-heic-decoder-20261007.js");
    const image = await decodeHeicPhoto(file);
    return { image, width: image.width, height: image.height, release: () => image.close() };
  }
}

function jpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("사진을 변환하지 못했습니다.")), "image/jpeg", quality);
  });
}

export async function prepareRepairPhoto(file) {
  let decoded;
  const canvas = document.createElement("canvas");
  try {
    decoded = await decodePhoto(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height));
    let width = Math.max(1, Math.round(decoded.width * scale));
    let height = Math.max(1, Math.round(decoded.height * scale));
    // Limit each upload to 2MB, retaining up to 3200px for repair details.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("사진을 변환하지 못했습니다.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      context.drawImage(decoded.image, 0, 0, width, height);
      for (const quality of [0.9, 0.82, 0.74]) {
        const blob = await jpegBlob(canvas, quality);
        if (blob.size <= TARGET_BYTES) {
          // Keep small standard images when recompression would make them larger.
          if (!isHeicPhoto(file) && IMAGE_TYPES.has(file.type) && scale === 1 && file.size <= blob.size) return file;
          const name = `${String(file.name || "photo").replace(/\.[^.]+$/, "")}.jpg`;
          return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified || Date.now() });
        }
      }
      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
    }
    throw new Error("사진 용량을 줄이지 못했습니다.");
  } catch {
    throw new Error(`${file.name || "사진"}: 사진을 처리하지 못했습니다. 파일을 다시 선택해주세요.`);
  } finally {
    decoded?.release();
    // iOS retains canvas backing stores until their dimensions are cleared.
    canvas.width = 1;
    canvas.height = 1;
  }
}

export async function prepareRepairPhotos(files, onProgress = () => {}) {
  validateRepairPhotos(files);
  const prepared = [];
  // Avoid decoding several full-resolution iPhone photos in memory at once.
  for (const [index, file] of files.entries()) {
    onProgress(index + 1, files.length);
    prepared.push(await prepareRepairPhoto(file));
  }
  return prepared;
}
