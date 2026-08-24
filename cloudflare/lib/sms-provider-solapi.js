const SOLAPI_ENDPOINT = "https://api.solapi.com/messages/v4/send-many/fast";
const SEND_TIMEOUT_MS = 12 * 1000;
const SMS_MAX_BYTES = 90;
const LMS_MAX_BYTES = 2000;

function cleanText(value, maxLength = 2400) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizePhone(value) {
  return cleanText(value, 40).replace(/[^0-9]/g, "");
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

export function getSolapiMessageType(text) {
  const byteLength = new TextEncoder().encode(String(text || "")).byteLength;
  if (byteLength <= SMS_MAX_BYTES) return { type: "SMS", byteLength };
  if (byteLength <= LMS_MAX_BYTES) return { type: "LMS", byteLength };
  throw Object.assign(new Error("문자 본문은 LMS 허용 길이 2,000byte를 넘을 수 없습니다."), { status: 400 });
}

export async function sendSolapiNotification(env, notification, fetchImpl = fetch) {
  const enabled = String(env?.SMS_ENABLED || "false").toLowerCase() === "true";
  const dryRun = String(env?.SMS_DRY_RUN ?? "true").toLowerCase() !== "false";
  const apiKey = cleanText(env?.SOLAPI_API_KEY, 500);
  const apiSecret = cleanText(env?.SOLAPI_API_SECRET, 500);
  const sender = normalizePhone(env?.SOLAPI_SENDER_NUMBER);
  const recipient = normalizePhone(notification?.recipient);
  const text = String(notification?.body_text || "");
  const messageType = getSolapiMessageType(text);

  if (!enabled || dryRun) {
    console.log(JSON.stringify({ event: "solapi_dry_run", type: messageType.type, bytes: messageType.byteLength }));
    return { disposition: "dry_run", providerMessageId: `dry-run:${notification?.id || "notification"}` };
  }
  if (!apiKey || !apiSecret || !sender) {
    return { disposition: "failed", error: "SOLAPI API 키 또는 발신번호가 설정되지 않았습니다." };
  }
  if (!recipient) return { disposition: "failed", error: "문자 수신 번호가 올바르지 않습니다." };

  const date = new Date().toISOString();
  const salt = crypto.randomUUID();
  const signature = await hmacSha256(apiSecret, `${date}${salt}`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetchImpl(SOLAPI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ to: recipient, from: sender, text, type: messageType.type }],
      }),
      signal: controller.signal,
    });
    const responseText = await response.text();
    let payload = null;
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {}
    if (response.ok) {
      return {
        disposition: "sent",
        providerMessageId: cleanText(payload?.groupInfo?.groupId || payload?.groupId || payload?.messageId, 240) || null,
      };
    }
    const error = cleanText(payload?.errorMessage || payload?.message || responseText || `SOLAPI ${response.status}`);
    if (response.status === 429 || response.status === 408 || response.status >= 500) {
      return { disposition: "retry", error };
    }
    return { disposition: "failed", error };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { disposition: "unknown", error: "SOLAPI 요청 timeout으로 전달 여부를 확인할 수 없습니다." };
    }
    return { disposition: "retry", error: cleanText(error?.message || "SOLAPI 네트워크 오류") };
  } finally {
    clearTimeout(timeoutId);
  }
}