import { handleOrderCancellationDecision, readOrderCancellationDecisionReview } from "../../../../cloudflare/lib/order-cancellation.js";
import { noContent } from "../../../../cloudflare/lib/http.js";

function renderHtml(title, body, { status = 200 } = {}) {
  return new Response(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { margin: 0; background: #f5f5f1; color: #111; font-family: Arial, sans-serif; }
    main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    section { width: min(560px, 100%); padding: 28px; background: #fff; border: 1px solid #111; }
    h1 { margin: 0 0 12px; font-size: 24px; font-weight: 500; }
    p { margin: 0; line-height: 1.6; }
    .meta { display: grid; gap: 8px; margin-top: 16px; font-size: 14px; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 24px; }
    button { height: 40px; padding: 0 16px; border: 1px solid #111; cursor: pointer; font-size: 14px; }
    .primary { background: #111; color: #fff; }
    .secondary { background: #fff; color: #111; }
  </style>
</head>
<body>
  <main>
    <section>${body}</section>
  </main>
</body>
</html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function onRequestOptions(context) {
  return noContent(context.env);
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const token = String(url.searchParams.get("token") || "").trim();

  if (!token) {
    return renderHtml("잘못된 요청", "<h1>잘못된 요청</h1><p>승인 링크 형식이 올바르지 않습니다.</p>", { status: 400 });
  }

  try {
    const review = await readOrderCancellationDecisionReview(context.env, token);

    if (!review) {
      return renderHtml("유효하지 않은 링크", "<h1>유효하지 않은 링크</h1><p>주문 취소 승인 링크를 찾을 수 없습니다.</p>", { status: 404 });
    }

    if (review.request.status !== "pending") {
      const message = review.request.status === "approved"
        ? "이 주문 취소 요청은 이미 승인되어 처리되었습니다."
        : review.request.status === "rejected"
          ? "이 주문 취소 요청은 이미 반려되었습니다."
          : "이 주문 취소 요청은 이미 처리되었습니다.";

      return renderHtml("이미 처리된 요청", `<h1>이미 처리된 요청</h1><p>${message}</p>`);
    }

    if (review.expired) {
      return renderHtml("승인 링크 만료", "<h1>승인 링크 만료</h1><p>이 승인 링크는 만료되었습니다. 고객이 다시 취소 요청을 보내야 합니다.</p>", { status: 410 });
    }

    const order = review.order;
    const body = `
      <h1>주문 취소 요청 검토</h1>
      <p>배송 준비 단계 주문의 취소 요청입니다. 아래에서 승인 또는 반려를 선택하세요.</p>
      <div class="meta">
        <div><strong>주문번호</strong> ${escapeHtml(order?.orderId || review.request.orderId || "-")}</div>
        <div><strong>주문자</strong> ${escapeHtml(order?.customer?.name || "회원")}${order?.customer?.email ? ` / ${escapeHtml(order.customer.email)}` : ""}</div>
        <div><strong>결제금액</strong> ${escapeHtml(`₩${Number(order?.totalAmount || 0).toLocaleString("ko-KR")}`)}</div>
        ${review.request.requestNote ? `<div><strong>요청 메모</strong> ${escapeHtml(review.request.requestNote)}</div>` : ""}
      </div>
      <div class="actions">
        <form method="post">
          <input type="hidden" name="token" value="${escapeHtml(token)}">
          <input type="hidden" name="action" value="approve">
          <button type="submit" class="primary">취소 승인</button>
        </form>
        <form method="post">
          <input type="hidden" name="token" value="${escapeHtml(token)}">
          <input type="hidden" name="action" value="reject">
          <button type="submit" class="secondary">요청 반려</button>
        </form>
      </div>
    `;

    return renderHtml("주문 취소 요청 검토", body);
  } catch (error) {
    return renderHtml("오류", `<h1>오류</h1><p>${escapeHtml(error?.message || "승인 페이지를 열지 못했습니다.")}</p>`, {
      status: Number(error?.status) || 500,
    });
  }
}

export async function onRequestPost(context) {
  try {
    const form = await context.request.formData();
    const token = String(form.get("token") || "").trim();
    const action = String(form.get("action") || "approve").trim().toLowerCase();

    if (!token || !["approve", "reject"].includes(action)) {
      return renderHtml("잘못된 요청", "<h1>잘못된 요청</h1><p>승인 요청 형식이 올바르지 않습니다.</p>", { status: 400 });
    }

    const result = await handleOrderCancellationDecision(context, { token, action });
    return renderHtml(result.title, `<h1>${escapeHtml(result.title)}</h1><p>${escapeHtml(result.message)}</p>`, {
      status: result.status,
    });
  } catch (error) {
    return renderHtml("오류", `<h1>오류</h1><p>${escapeHtml(error?.message || "주문 취소 결정을 처리하지 못했습니다.")}</p>`, {
      status: Number(error?.status) || 500,
    });
  }
}