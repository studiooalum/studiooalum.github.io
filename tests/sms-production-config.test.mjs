import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const wranglerConfig = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

test("production deploys keep SMS enabled and dry-run disabled", () => {
  assert.match(wranglerConfig, /"SMS_ENABLED"\s*:\s*"true"/);
  assert.match(wranglerConfig, /"SMS_DRY_RUN"\s*:\s*"false"/);
  assert.match(wranglerConfig, /"SMS_COUNTRY_ALLOWLIST"\s*:\s*"KR"/);
});
