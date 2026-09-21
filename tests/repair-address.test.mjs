import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { inferRepairCountryCode } from "../cloudflare/lib/repair-address.js";

test("Repair address inference recognizes common Korean local and abbreviated addresses", () => {
  assert.equal(inferRepairCountryCode({ shippingAddress: "양주시 독바위로433, 107동 1204호" }), "KR");
  assert.equal(inferRepairCountryCode({ shippingAddress: "경기 안양시 동안구 관평로212번길 15" }), "KR");
  assert.equal(inferRepairCountryCode({ shippingAddress: "충북 청주시 상당구 상당로 1" }), "KR");
});

test("Repair address inference does not mistake foreign or non-address Korean text for Korea", () => {
  assert.equal(inferRepairCountryCode({ shippingAddress: "일본 오사카시 주오구 1-2-3" }), "OTHER");
  assert.equal(inferRepairCountryCode({ shippingAddress: "베트남 호치민시 1군" }), "OTHER");
  assert.equal(inferRepairCountryCode({ shippingAddress: "서울시립대학교 기숙사" }), "OTHER");
});

test("Korean address correction updates eligible Repair requests only", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE repair_requests (
      id TEXT PRIMARY KEY,
      country_code TEXT,
      shipping_address TEXT,
      phone TEXT
    );
    INSERT INTO repair_requests VALUES
      ('LOCAL_CITY', 'OTHER', '양주시 독바위로433, 107동 1204호', '01071032683'),
      ('LOCAL_SHORT', 'OTHER', '경기 안양시 동안구 관평로212번길 15', '010-6612-4678'),
      ('OVERSEAS', 'OTHER', '일본 오사카시 주오구 1-2-3', '01012345678'),
      ('NO_MOBILE', 'OTHER', '양주시 독바위로433', '0311234567');
  `);
  database.exec(readFileSync(new URL("../cloudflare/d1/migrations/0029_repair_korean_address_detection.sql", import.meta.url), "utf8"));
  const rows = database.prepare("SELECT id, country_code FROM repair_requests ORDER BY id").all()
    .map((row) => ({ id: row.id, country_code: row.country_code }));
  database.close();
  assert.deepEqual(rows, [
    { id: "LOCAL_CITY", country_code: "KR" },
    { id: "LOCAL_SHORT", country_code: "KR" },
    { id: "NO_MOBILE", country_code: "OTHER" },
    { id: "OVERSEAS", country_code: "OTHER" },
  ]);
});
