import assert from "node:assert/strict";
import test from "node:test";
import { isHeicPhoto, validateRepairPhotos } from "../runtime/storefront/scripts/repair-photo-upload.js";

test("repair photos accept eight iPhone HEIC images up to 20MB each", () => {
  const photo = { name: "IMG_1234.HEIC", type: "image/heic", size: 20 * 1024 * 1024 };
  assert.doesNotThrow(() => validateRepairPhotos(Array(8).fill(photo)));
  assert.equal(isHeicPhoto({ ...photo, type: "" }), true);
  assert.equal(isHeicPhoto({ ...photo, name: "photo", type: "image/heif" }), true);
  assert.equal(isHeicPhoto({ name: "photo.jpg", type: "image/jpeg" }), false);
  assert.throws(() => validateRepairPhotos(Array(9).fill(photo)), /최대 8장/);
  assert.throws(() => validateRepairPhotos([{ ...photo, size: photo.size + 1 }]), /20MB/);
});

test("repair photo validation permits common images and rejects empty or non-image files", () => {
  assert.doesNotThrow(() => validateRepairPhotos([{ name: "photo.JPG", type: "", size: 1024 }]));
  assert.doesNotThrow(() => validateRepairPhotos([{ name: "photo.avif", type: "image/avif", size: 1024 }]));
  assert.throws(() => validateRepairPhotos([{ name: "photo.heic", type: "image/heic", size: 0 }]), /비어/);
  assert.throws(() => validateRepairPhotos([{ name: "file.pdf", type: "application/pdf", size: 1024 }]), /사진을 선택/);
});
