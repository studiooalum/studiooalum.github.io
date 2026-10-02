import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { formatSolapiMessage, sendSolapiNotification } from "../cloudflare/lib/sms-provider-solapi.js";

const wranglerConfig = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

test("production deploys keep SMS enabled and dry-run disabled", () => {
  assert.match(wranglerConfig, /"SMS_ENABLED"\s*:\s*"true"/);
  assert.match(wranglerConfig, /"SMS_DRY_RUN"\s*:\s*"false"/);
  assert.match(wranglerConfig, /"SMS_COUNTRY_ALLOWLIST"\s*:\s*"KR"/);
});

test("repair LMS uses the repair heading once as the carrier subject", async () => {
  const body = [
    "[Studio OALUM 수선 안내]",
    "한아름님, 보내주신 수선 제품을 잘 받았습니다.",
    "예상 가격: 80,000원",
    "실제 작업 범위에 따라 금액이 달라질 수 있습니다.",
    "이후 진행 안내는 아래 수선 티켓에서 확인해주세요.",
    "https://studiooalum.com/t/example",
  ].join("\n");
  const formatted = formatSolapiMessage(body);
  assert.equal(formatted.type, "LMS");
  assert.equal(formatted.subject, "[Studio OALUM 수선 안내]");
  assert.doesNotMatch(formatted.text, /Studio OALUM 수선 안내/);

  let requestBody;
  const result = await sendSolapiNotification({
    SMS_ENABLED: "true",
    SMS_DRY_RUN: "false",
    SOLAPI_API_KEY: "test-key",
    SOLAPI_API_SECRET: "test-secret",
    SOLAPI_SENDER_NUMBER: "01047465999",
  }, {
    id: "notification-1",
    recipient: "01012345678",
    body_text: body,
  }, async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ groupId: "group-1" }), { status: 200 });
  });

  assert.equal(result.disposition, "sent");
  assert.equal(requestBody.messages[0].subject, "[Studio OALUM 수선 안내]");
  assert.doesNotMatch(requestBody.messages[0].text, /Studio OALUM 수선 안내/);
});
