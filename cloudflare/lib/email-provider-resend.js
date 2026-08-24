const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEND_TIMEOUT_MS = 12 * 1000;

function cleanText(value, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

export async function sendResendNotification(env, notification, fetchImpl = fetch) {
  const apiKey = cleanText(env?.RESEND_API_KEY, 1000);
  const from = cleanText(env?.RESEND_FROM_EMAIL, 320);
  const recipient = cleanText(notification?.recipient, 320).toLowerCase();
  if (!apiKey) return { disposition: "failed", error: "RESEND_API_KEY가 설정되지 않았습니다." };
  if (!from) return { disposition: "failed", error: "RESEND_FROM_EMAIL이 설정되지 않았습니다." };
  if (!EMAIL_PATTERN.test(recipient)) return { disposition: "failed", error: "수신 이메일 주소 형식이 올바르지 않습니다." };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": cleanText(notification.event_key, 240),
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: cleanText(notification.subject, 500),
        text: String(notification.body_text || ""),
        html: String(notification.body_html || ""),
      }),
      signal: controller.signal,
    });
    const responseText = await response.text();
    let payload = null;
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {}
    if (response.ok) {
      return { disposition: "sent", providerMessageId: cleanText(payload?.id, 240) || null };
    }
    const error = cleanText(payload?.message || responseText || `Resend ${response.status}`);
    if (response.status === 429 || response.status === 408 || response.status >= 500) {
      return { disposition: "retry", error };
    }
    return { disposition: "failed", error };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { disposition: "unknown", error: "Resend 요청 timeout으로 전달 여부를 확인할 수 없습니다." };
    }
    return { disposition: "retry", error: cleanText(error?.message || "Resend 네트워크 오류") };
  } finally {
    clearTimeout(timeoutId);
  }
}