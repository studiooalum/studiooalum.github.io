import { persistPayment, readOrderSyncSnapshot, updateShipment } from "./d1.js";
import { dispatchOrderSync, getOrderSyncEventType, shouldEmailForOrderSyncEvent } from "./order-sync.js";
import { cancelTossPayment } from "./toss.js";

const APPROVAL_TTL_MS = 48 * 60 * 60 * 1000;
let cancellationSchemaReady = false;

function getDb(env) {
  return env?.OALUM_DB || null;
}

function requireDb(env) {
  const database = getDb(env);
  if (!database) {
    throw Object.assign(new Error("D1 binding is required for order cancellation."), {
      status: 503,
    });
  }

  return database;
}

function nowIso() {
  return new Date().toISOString();
}

function addMs(timestamp, ms) {
  return new Date(new Date(timestamp).getTime() + ms).toISOString();
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function parseEmailList(value) {
  return Array.from(new Set(
    String(value || "")
      .split(/[\n,;]/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  ));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPrice(value) {
  return `₩${Math.round(Number(value) || 0).toLocaleString("ko-KR")}`;
}

function randomToken(byteLength = 24) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function wrapCancellationStorageError(error, fallbackMessage = "주문 취소 저장소를 처리하지 못했습니다.") {
  const message = String(error?.message || "");
  throw Object.assign(new Error(fallbackMessage), {
    status: Number(error?.status) || 500,
    details: error?.details || { cause: message || fallbackMessage },
  });
}

async function ensureCancellationSchema(database) {
  if (!database || cancellationSchemaReady) {
    return;
  }

  await database
    .prepare(`
      CREATE TABLE IF NOT EXISTS order_cancellation_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        user_id TEXT,
        mode TEXT NOT NULL DEFAULT 'approval',
        status TEXT NOT NULL DEFAULT 'pending',
        request_note TEXT NOT NULL DEFAULT '',
        approval_token TEXT NOT NULL UNIQUE,
        expires_at TEXT,
        requested_at TEXT NOT NULL,
        decided_at TEXT,
        processed_at TEXT,
        decision_note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `)
    .run();

  await database
    .prepare(`CREATE INDEX IF NOT EXISTS idx_order_cancellation_requests_order_id ON order_cancellation_requests(order_id, created_at DESC)`)
    .run();

  await database
    .prepare(`CREATE INDEX IF NOT EXISTS idx_order_cancellation_requests_status ON order_cancellation_requests(status, created_at DESC)`)
    .run();

  await database
    .prepare(`CREATE INDEX IF NOT EXISTS idx_order_cancellation_requests_token ON order_cancellation_requests(approval_token)`)
    .run();

  cancellationSchemaReady = true;
}

function mapCancellationRequestRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id) || 0,
    orderId: row.order_id,
    userId: row.user_id || null,
    mode: row.mode || "approval",
    status: row.status || "pending",
    requestNote: row.request_note || "",
    token: row.approval_token || "",
    expiresAt: row.expires_at || null,
    requestedAt: row.requested_at || null,
    decidedAt: row.decided_at || null,
    processedAt: row.processed_at || null,
    decisionNote: row.decision_note || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function isPendingRequestExpired(request) {
  if (!request?.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(request.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function isConfirmedPaymentStatus(value) {
  return ["confirmed", "done", "paid", "completed", "success", "succeeded"].includes(normalizeStatus(value));
}

function isCancelledPaymentStatus(value) {
  return ["cancelled", "canceled", "refunded", "refund", "partial_refunded", "partial-refunded"].includes(normalizeStatus(value));
}

function isFinalCancelledOrder(order) {
  return isCancelledPaymentStatus(order?.paymentStatus) || isCancelledPaymentStatus(order?.status);
}

function getShipmentStatus(order) {
  return normalizeStatus(order?.shipment?.status);
}

function isShippedOrBeyond(order) {
  return ["shipped", "delivered", "returned"].includes(getShipmentStatus(order));
}

function getApprovalReviewUrl(origin, token) {
  const reviewUrl = new URL("/api/orders/cancellation/decision", origin);
  reviewUrl.searchParams.set("token", token);
  return reviewUrl.toString();
}

function getApprovalRecipients(env) {
  return parseEmailList(env?.ORDER_NOTIFICATION_EMAILS);
}

function buildApprovalEmailHtml({ order, request, user, origin }) {
  const reviewUrl = getApprovalReviewUrl(origin, request.token);
  const itemMarkup = Array.isArray(order?.items)
    ? order.items.slice(0, 5).map((item) => {
      const title = [item?.title, item?.editionLabel].filter(Boolean).join(" / ");
      const quantity = Number(item?.quantity) || 0;
      return `<li>${escapeHtml(title || "상품")}${quantity > 1 ? ` × ${quantity}` : ""}</li>`;
    }).join("")
    : "";

  return `
    <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.6;">
      <h2 style="margin: 0 0 16px; font-size: 20px;">주문 취소 승인 요청</h2>
      <p style="margin: 0 0 10px;">배송 준비 단계 주문의 취소 요청이 접수되었습니다.</p>
      <p style="margin: 0 0 10px;"><strong>주문번호</strong> ${escapeHtml(order?.orderId || "-")}</p>
      <p style="margin: 0 0 10px;"><strong>주문자</strong> ${escapeHtml(order?.customer?.name || user?.fullName || "회원")}${order?.customer?.email ? ` / ${escapeHtml(order.customer.email)}` : ""}</p>
      <p style="margin: 0 0 10px;"><strong>결제금액</strong> ${escapeHtml(formatPrice(order?.totalAmount || 0))}</p>
      ${request?.requestNote ? `<p style="margin: 0 0 10px;"><strong>요청 메모</strong> ${escapeHtml(request.requestNote)}</p>` : ""}
      ${itemMarkup ? `<ul style="margin: 10px 0 18px; padding-left: 18px;">${itemMarkup}</ul>` : ""}
      <div style="margin: 20px 0;">
        <a href="${reviewUrl}" style="display: inline-block; padding: 10px 18px; background: #111; color: #fff; text-decoration: none;">취소 요청 검토하기</a>
      </div>
      <p style="margin: 0; color: rgba(17, 17, 17, 0.66); font-size: 13px;">검토 페이지에서 승인 또는 반려를 선택할 수 있습니다. 링크는 48시간 동안 유효합니다.</p>
    </div>
  `;
}

async function sendResendEmail(env, { to, subject, html }) {
  const resendApiKey = String(env?.RESEND_API_KEY || "").trim();
  if (!resendApiKey) {
    throw Object.assign(new Error("RESEND_API_KEY가 설정되지 않아 승인 요청 메일을 보낼 수 없습니다."), {
      status: 503,
    });
  }

  const from = String(env?.RESEND_FROM_EMAIL || "").trim();
  if (!from) {
    throw Object.assign(new Error("RESEND_FROM_EMAIL이 설정되지 않아 승인 요청 메일을 보낼 수 없습니다."), {
      status: 503,
    });
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw Object.assign(new Error("승인 요청 메일을 보내지 못했습니다."), {
      status: 502,
      details: {
        status: response.status,
        body: details,
      },
    });
  }
}

async function readOrderCancellationRequestByToken(database, token) {
  await ensureCancellationSchema(database);

  try {
    const row = await database
      .prepare(`
        SELECT *
        FROM order_cancellation_requests
        WHERE approval_token = ?
        LIMIT 1
      `)
      .bind(String(token || "").trim())
      .first();

    return mapCancellationRequestRow(row);
  } catch (error) {
    wrapCancellationStorageError(error);
  }
}

async function createApprovalRequestRecord(database, {
  orderId,
  userId,
  requestNote = "",
  now,
}) {
  const token = randomToken();
  const expiresAt = addMs(now, APPROVAL_TTL_MS);

  await ensureCancellationSchema(database);

  try {
    await database
      .prepare(`
        INSERT INTO order_cancellation_requests (
          order_id,
          user_id,
          mode,
          status,
          request_note,
          approval_token,
          expires_at,
          requested_at,
          created_at,
          updated_at
        ) VALUES (?, ?, 'approval', 'pending', ?, ?, ?, ?, ?, ?)
      `)
      .bind(orderId, userId || null, String(requestNote || "").trim().slice(0, 400), token, expiresAt, now, now, now)
      .run();
  } catch (error) {
    wrapCancellationStorageError(error, "주문 취소 승인 요청을 저장하지 못했습니다.");
  }

  return readOrderCancellationRequestByToken(database, token);
}

async function updateOrderCancellationRequest(database, {
  id,
  status,
  decisionNote = "",
  decidedAt = null,
  processedAt = null,
  now = nowIso(),
}) {
  await ensureCancellationSchema(database);

  try {
    await database
      .prepare(`
        UPDATE order_cancellation_requests
        SET status = ?,
            decision_note = ?,
            decided_at = COALESCE(?, decided_at),
            processed_at = COALESCE(?, processed_at),
            updated_at = ?
        WHERE id = ?
      `)
      .bind(status, decisionNote, decidedAt, processedAt, now, id)
      .run();
  } catch (error) {
    wrapCancellationStorageError(error, "주문 취소 승인 요청 상태를 저장하지 못했습니다.");
  }

  const row = await database
    .prepare(`SELECT * FROM order_cancellation_requests WHERE id = ? LIMIT 1`)
    .bind(id)
    .first();

  return mapCancellationRequestRow(row);
}

function getCancellationAmount(order) {
  return Number(
    order?.payment?.approvedAmount
      ?? order?.payment?.requestedAmount
      ?? order?.totalAmount
      ?? 0,
  ) || 0;
}

function getOrderPaymentKey(order) {
  return String(order?.payment?.paymentKey || order?.activePaymentKey || "").trim();
}

function assertOrderCanBeProcessed(order) {
  if (!order) {
    throw Object.assign(new Error("주문 정보를 찾을 수 없습니다."), {
      status: 404,
    });
  }

  if (!isConfirmedPaymentStatus(order?.paymentStatus)) {
    throw Object.assign(new Error("결제가 완료된 주문만 취소할 수 있습니다."), {
      status: 409,
    });
  }

  if (isShippedOrBeyond(order)) {
    throw Object.assign(new Error("배송이 시작된 주문은 자동 취소할 수 없습니다."), {
      status: 409,
    });
  }

  if (!getOrderPaymentKey(order)) {
    throw Object.assign(new Error("결제 취소에 필요한 결제 키를 찾지 못했습니다."), {
      status: 409,
    });
  }
}

export async function readLatestOrderCancellationRequest(database, { orderId } = {}) {
  if (!database || !orderId) {
    return null;
  }

  try {
    await ensureCancellationSchema(database);

    const row = await database
      .prepare(`
        SELECT *
        FROM order_cancellation_requests
        WHERE order_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `)
      .bind(orderId)
      .first();

    return mapCancellationRequestRow(row);
  } catch {
    return null;
  }
}

export function getCustomerOrderCancellationState(order, request = null) {
  if (!order) {
    return {
      available: false,
      action: null,
      buttonLabel: "",
      status: "unavailable",
      message: "주문 정보를 찾을 수 없습니다.",
      request,
    };
  }

  const shipmentStatus = getShipmentStatus(order);
  const paymentStatus = normalizeStatus(order?.paymentStatus);

  if (shipmentStatus === "cancelled" || shipmentStatus === "canceled" || isFinalCancelledOrder(order)) {
    return {
      available: false,
      action: null,
      buttonLabel: "",
      status: "completed",
      message: "이미 취소 또는 환불 처리된 주문입니다.",
      request,
    };
  }

  if (request?.status === "pending" && !isPendingRequestExpired(request)) {
    return {
      available: false,
      action: null,
      buttonLabel: "",
      status: "pending_approval",
      message: "취소 승인 대기 중입니다. 판매자 확인 후 자동으로 처리됩니다.",
      request,
    };
  }

  if (!isConfirmedPaymentStatus(paymentStatus)) {
    return {
      available: false,
      action: null,
      buttonLabel: "",
      status: "unavailable",
      message: "결제가 완료된 주문만 취소할 수 있습니다.",
      request,
    };
  }

  if (shipmentStatus === "confirmed" || !shipmentStatus) {
    return {
      available: true,
      action: "direct_cancel",
      buttonLabel: "주문 취소",
      status: "available",
      message: "",
      request,
    };
  }

  if (["ready", "packing"].includes(shipmentStatus)) {
    let message = "배송 준비 단계이므로 판매자 승인 후 취소됩니다.";
    let buttonLabel = "주문 취소 요청";

    if (request?.status === "rejected") {
      message = "이전 취소 요청이 반려되었습니다. 다시 요청할 수 있습니다.";
      buttonLabel = "다시 취소 요청";
    } else if (request?.status === "failed") {
      message = "이전 취소 처리에 실패했습니다. 다시 요청하거나 관리자에게 문의해주세요.";
      buttonLabel = "다시 취소 요청";
    } else if (request && isPendingRequestExpired(request)) {
      message = "이전 취소 요청이 만료되었습니다. 다시 요청해주세요.";
    }

    return {
      available: true,
      action: "request_approval",
      buttonLabel,
      status: "approval_required",
      message,
      request,
    };
  }

  if (isShippedOrBeyond(order)) {
    return {
      available: false,
      action: null,
      buttonLabel: "",
      status: "unavailable",
      message: "배송이 시작된 주문은 계정 화면에서 자동 취소할 수 없습니다.",
      request,
    };
  }

  return {
    available: false,
    action: null,
    buttonLabel: "",
    status: "unavailable",
    message: "현재 단계에서는 주문 취소를 진행할 수 없습니다.",
    request,
  };
}

export async function processOrderCancellation(context, {
  order,
  reason = "고객 요청으로 주문이 취소되었습니다.",
  source = "customer-account",
  providerMode = "live-cancellation",
  requestRecord = null,
}) {
  const database = requireDb(context.env);
  const now = nowIso();

  if (isFinalCancelledOrder(order) || ["cancelled", "canceled"].includes(getShipmentStatus(order))) {
    if (requestRecord?.id && requestRecord.status === "pending") {
      await updateOrderCancellationRequest(database, {
        id: requestRecord.id,
        status: "approved",
        decisionNote: "이미 취소 완료된 주문으로 확인되었습니다.",
        decidedAt: now,
        processedAt: now,
        now,
      });
    }

    return {
      order: await readOrderSyncSnapshot(context.env, order.orderId),
      payment: order.payment || null,
      syncTriggered: false,
      alreadyCancelled: true,
    };
  }

  assertOrderCanBeProcessed(order);

  const payment = await cancelTossPayment(context.env, {
    paymentKey: getOrderPaymentKey(order),
    orderId: order.orderId,
    amount: getCancellationAmount(order),
    cancelReason: reason,
  });

  const persisted = await persistPayment(context.env, {
    ...payment,
    providerMode,
    rawRequest: {
      cancelReason: reason,
      source,
      requestId: requestRecord?.id || null,
    },
  });

  if (!persisted) {
    throw Object.assign(new Error("결제 취소 정보를 저장하지 못했습니다."), {
      status: 502,
    });
  }

  try {
    await updateShipment(context.env, {
      orderId: order.orderId,
      status: "cancelled",
    });
  } catch (error) {
    console.error("Failed to mark shipment as cancelled after payment cancellation.", {
      orderId: order.orderId,
      message: error?.message || String(error),
    });
  }

  if (requestRecord?.id && requestRecord.status === "pending") {
    await updateOrderCancellationRequest(database, {
      id: requestRecord.id,
      status: "approved",
      decisionNote: "판매자 승인 후 자동 취소가 완료되었습니다.",
      decidedAt: now,
      processedAt: now,
      now,
    });
  }

  const updatedOrder = await readOrderSyncSnapshot(context.env, order.orderId);
  const eventType = getOrderSyncEventType(payment.status);
  const syncTriggered = updatedOrder
    ? await dispatchOrderSync(context, {
      eventType,
      order: updatedOrder,
      meta: {
        sendEmail: shouldEmailForOrderSyncEvent(eventType),
        syncSource: source,
        providerMode,
      },
    })
    : false;

  return {
    order: updatedOrder,
    payment,
    syncTriggered,
    alreadyCancelled: false,
  };
}

export async function requestOrderCancellationApproval(context, {
  order,
  user,
  reason = "고객이 배송 준비 단계 주문 취소를 요청했습니다.",
}) {
  const database = requireDb(context.env);
  await ensureCancellationSchema(database);
  const recipients = getApprovalRecipients(context.env);

  if (recipients.length === 0) {
    throw Object.assign(new Error("ORDER_NOTIFICATION_EMAILS가 설정되지 않아 판매자 승인 요청을 보낼 수 없습니다."), {
      status: 503,
    });
  }

  let requestRecord = await readLatestOrderCancellationRequest(database, { orderId: order.orderId });
  const state = getCustomerOrderCancellationState(order, requestRecord);

  if (state.action !== "request_approval") {
    if (state.status === "pending_approval") {
      return {
        request: requestRecord,
        created: false,
        mailed: false,
      };
    }

    throw Object.assign(new Error(state.message || "현재 단계에서는 승인 요청을 보낼 수 없습니다."), {
      status: 409,
    });
  }

  const now = nowIso();

  if (requestRecord?.status === "pending" && isPendingRequestExpired(requestRecord)) {
    requestRecord = await updateOrderCancellationRequest(database, {
      id: requestRecord.id,
      status: "rejected",
      decisionNote: "승인 링크가 만료되었습니다.",
      decidedAt: now,
      now,
    });
  }

  requestRecord = await createApprovalRequestRecord(database, {
    orderId: order.orderId,
    userId: user?.id || null,
    requestNote: reason,
    now,
  });

  await sendResendEmail(context.env, {
    to: recipients,
    subject: `[Studio OALUM] 주문 취소 승인 요청 ${order.orderId}`,
    html: buildApprovalEmailHtml({
      order,
      request: requestRecord,
      user,
      origin: new URL(context.request.url).origin,
    }),
  });

  return {
    request: requestRecord,
    created: true,
    mailed: true,
  };
}

export async function readOrderCancellationDecisionReview(env, token) {
  const database = requireDb(env);
  await ensureCancellationSchema(database);
  const requestRecord = await readOrderCancellationRequestByToken(database, token);

  if (!requestRecord) {
    return null;
  }

  const order = await readOrderSyncSnapshot(env, requestRecord.orderId);

  return {
    request: requestRecord,
    order,
    expired: requestRecord.status === "pending" && isPendingRequestExpired(requestRecord),
  };
}

export async function handleOrderCancellationDecision(context, {
  token,
  action,
}) {
  const database = requireDb(context.env);
  await ensureCancellationSchema(database);
  const requestRecord = await readOrderCancellationRequestByToken(database, token);

  if (!requestRecord) {
    return {
      ok: false,
      status: 404,
      title: "유효하지 않은 링크",
      message: "주문 취소 승인 링크를 찾을 수 없습니다.",
    };
  }

  if (requestRecord.status !== "pending") {
    const title = requestRecord.status === "approved"
      ? "이미 처리된 요청"
      : requestRecord.status === "rejected"
        ? "이미 반려된 요청"
        : "이미 처리된 요청";

    const message = requestRecord.status === "approved"
      ? "이 주문 취소 요청은 이미 승인되어 처리되었습니다."
      : requestRecord.status === "rejected"
        ? "이 주문 취소 요청은 이미 반려되었습니다."
        : "이 주문 취소 요청은 이미 처리되었습니다.";

    return {
      ok: true,
      status: 200,
      title,
      message,
    };
  }

  if (isPendingRequestExpired(requestRecord)) {
    await updateOrderCancellationRequest(database, {
      id: requestRecord.id,
      status: "rejected",
      decisionNote: "승인 링크가 만료되었습니다.",
      decidedAt: nowIso(),
    });

    return {
      ok: false,
      status: 410,
      title: "승인 링크 만료",
      message: "이 승인 링크는 만료되었습니다. 고객이 다시 취소 요청을 보내야 합니다.",
    };
  }

  const order = await readOrderSyncSnapshot(context.env, requestRecord.orderId);
  if (!order) {
    await updateOrderCancellationRequest(database, {
      id: requestRecord.id,
      status: "failed",
      decisionNote: "주문 스냅샷을 찾지 못했습니다.",
      decidedAt: nowIso(),
    });

    return {
      ok: false,
      status: 404,
      title: "주문을 찾을 수 없음",
      message: "취소할 주문 정보를 찾지 못했습니다.",
    };
  }

  if (action === "reject") {
    await updateOrderCancellationRequest(database, {
      id: requestRecord.id,
      status: "rejected",
      decisionNote: "판매자가 취소 요청을 반려했습니다.",
      decidedAt: nowIso(),
    });

    return {
      ok: true,
      status: 200,
      title: "취소 요청 반려 완료",
      message: `주문 ${order.orderId}의 취소 요청을 반려했습니다.`,
    };
  }

  try {
    await processOrderCancellation(context, {
      order,
      reason: requestRecord.requestNote || "배송 준비 단계 주문 취소 승인",
      source: "seller-approval",
      providerMode: "seller-approval-cancellation",
      requestRecord,
    });

    return {
      ok: true,
      status: 200,
      title: "주문 취소 승인 완료",
      message: `주문 ${order.orderId}의 취소와 환불 처리가 완료되었습니다.`,
    };
  } catch (error) {
    await updateOrderCancellationRequest(database, {
      id: requestRecord.id,
      status: "failed",
      decisionNote: error?.message || "자동 취소 처리에 실패했습니다.",
      decidedAt: nowIso(),
    });

    return {
      ok: false,
      status: Number(error?.status) || 500,
      title: "주문 취소 처리 실패",
      message: error?.message || "자동 취소 처리 중 오류가 발생했습니다.",
    };
  }
}