function getDb(env) {
  return env?.OALUM_DB || null;
}

import {
  prepareCouponPricing,
  reserveCouponForOrder,
  settleExpiredCouponReservations,
  syncOrderCouponState,
} from "./coupons.js";

export function hasD1(env) {
  return Boolean(getDb(env));
}

const POINTS_MIN_REDEEM = 1000;
const POINTS_EARN_RATE = 0.03;
const POINTS_RESERVATION_WINDOW_MS = 30 * 60 * 1000;

function roundAmount(value) {
  const amount = Math.round(Number(value) || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeTimestamp(value) {
  const timestamp = String(value || "").trim();
  return timestamp || null;
}

function normalizePoints(value) {
  const points = Math.floor(Number(value) || 0);
  return Number.isFinite(points) && points > 0 ? points : 0;
}

function calculateEarnedPoints(totalAmount) {
  const amount = roundAmount(totalAmount);
  return Math.max(0, Math.floor(amount * POINTS_EARN_RATE));
}

function buildPointsReservationExpiry(now) {
  return new Date(new Date(now).getTime() + POINTS_RESERVATION_WINDOW_MS).toISOString();
}

function encodeJson(value, fallback = {}) {
  return JSON.stringify(value == null ? fallback : value);
}

function decodeJson(value, fallback = null) {
  if (value == null || value === "") {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizePaymentStatus(status) {
  return String(status || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeShipmentStatus(status, fallback = "confirmed") {
  const normalized = String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  switch (normalized) {
    case "confirmed":
    case "ready":
    case "packing":
    case "shipped":
    case "delivered":
    case "returned":
      return normalized;
    default:
      return fallback;
  }
}

function mapShipmentRecord(shipment) {
  if (!shipment) {
    return null;
  }

  return {
    status: normalizeShipmentStatus(shipment.status),
    carrierId: shipment.carrier_id || "",
    carrier: shipment.carrier || "",
    trackingNumber: shipment.tracking_number || "",
    trackingUrl: shipment.tracking_url || "",
    trackerRegisteredAt: normalizeTimestamp(shipment.tracker_registered_at),
    trackerLastSyncedAt: normalizeTimestamp(shipment.tracker_last_synced_at),
    trackerLastEventAt: normalizeTimestamp(shipment.tracker_last_event_at),
    trackerLastEventCode: shipment.tracker_last_event_code || "",
    trackerLastEventName: shipment.tracker_last_event_name || "",
    trackerLastEventDescription: shipment.tracker_last_event_description || "",
    shippedAt: normalizeTimestamp(shipment.shipped_at),
    deliveredAt: normalizeTimestamp(shipment.delivered_at),
    updatedAt: normalizeTimestamp(shipment.updated_at),
  };
}

function getPaymentLifecycle(status, { defaultToPending = false } = {}) {
  const normalized = normalizePaymentStatus(status);

  switch (normalized) {
    case "DONE":
    case "CONFIRMED":
      return {
        orderStatus: "paid",
        paymentStatus: "confirmed",
        eventType: "payment.confirmed",
      };
    case "AUTHORIZED":
      return {
        orderStatus: "payment_pending",
        paymentStatus: "authorized",
        eventType: "payment.authorized",
      };
    case "READY":
    case "IN_PROGRESS":
    case "WAITING_FOR_DEPOSIT":
    case "PENDING":
      return {
        orderStatus: "payment_pending",
        paymentStatus: "pending",
        eventType: "payment.pending",
      };
    case "PARTIAL_CANCELED":
    case "PARTIAL_CANCELLED":
    case "REFUND":
    case "REFUNDED":
      return {
        orderStatus: "refunded",
        paymentStatus: "refunded",
        eventType: "payment.refunded",
      };
    case "CANCELED":
    case "CANCELLED":
      return {
        orderStatus: "cancelled",
        paymentStatus: "cancelled",
        eventType: "payment.cancelled",
      };
    case "ABORTED":
    case "EXPIRED":
    case "FAILED":
      return {
        orderStatus: "payment_failed",
        paymentStatus: "failed",
        eventType: "payment.failed",
      };
    default:
      return defaultToPending
        ? {
            orderStatus: "payment_pending",
            paymentStatus: "pending",
            eventType: "payment.updated",
          }
        : null;
  }
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return null;
}

function inferOrderId(payload) {
  return firstDefined(
    payload?.orderId,
    payload?.data?.orderId,
    payload?.payment?.orderId,
    payload?.payment?.orderNo,
  );
}

function inferPaymentKey(payload) {
  return firstDefined(
    payload?.paymentKey,
    payload?.data?.paymentKey,
    payload?.payment?.paymentKey,
  );
}

function inferDeliveryId(payload, explicitDeliveryId) {
  return firstDefined(
    explicitDeliveryId,
    payload?.deliveryId,
    payload?.eventId,
    payload?.event_id,
    payload?.data?.deliveryId,
    payload?.data?.eventId,
    payload?.data?.event_id,
    payload?.lastTransactionKey,
    payload?.data?.lastTransactionKey,
  );
}

function inferPaymentStatus(payload) {
  return firstDefined(
    payload?.status,
    payload?.data?.status,
    payload?.payment?.status,
    payload?.data?.payment?.status,
  );
}

function inferPaymentMethod(payload) {
  return firstDefined(
    payload?.method,
    payload?.data?.method,
    payload?.payment?.method,
  );
}

function inferTossOrderId(payload) {
  return firstDefined(
    payload?.orderId,
    payload?.data?.orderId,
    payload?.payment?.orderId,
  );
}

function inferApprovedAt(payload) {
  return normalizeTimestamp(
    firstDefined(
      payload?.approvedAt,
      payload?.data?.approvedAt,
      payload?.payment?.approvedAt,
    ),
  );
}

function inferCancelledAt(payload) {
  return normalizeTimestamp(
    firstDefined(
      payload?.cancelledAt,
      payload?.canceledAt,
      payload?.data?.cancelledAt,
      payload?.data?.canceledAt,
      payload?.payment?.cancelledAt,
      payload?.payment?.canceledAt,
    ),
  );
}

function inferPaymentAmount(payload) {
  const amounts = [
    payload?.totalAmount,
    payload?.approvedAmount,
    payload?.amount,
    payload?.balanceAmount,
    payload?.suppliedAmount,
    payload?.cancelAmount,
    payload?.data?.totalAmount,
    payload?.data?.approvedAmount,
    payload?.data?.amount,
    payload?.data?.balanceAmount,
    payload?.data?.suppliedAmount,
    payload?.data?.cancelAmount,
    payload?.payment?.totalAmount,
    payload?.payment?.approvedAmount,
    payload?.payment?.amount,
    payload?.payment?.balanceAmount,
    payload?.payment?.suppliedAmount,
    payload?.payment?.cancelAmount,
    payload?.cancels?.[0]?.cancelAmount,
    payload?.data?.cancels?.[0]?.cancelAmount,
    payload?.payment?.cancels?.[0]?.cancelAmount,
  ];

  for (const candidate of amounts) {
    const amount = roundAmount(candidate);
    if (amount > 0) {
      return amount;
    }
  }

  return 0;
}

function inferEventType(payload, lifecycle) {
  return String(
    lifecycle?.eventType ||
      payload?.eventType ||
      payload?.type ||
      payload?.event_name ||
      "webhook.received",
  ).trim();
}

async function findPaymentRecord(database, { paymentKey, orderId } = {}) {
  if (paymentKey) {
    return (await database
      .prepare(`SELECT * FROM payments WHERE payment_key = ? LIMIT 1`)
      .bind(paymentKey)
      .first()) || null;
  }

  if (!orderId) {
    return null;
  }

  return (await database
    .prepare(`
      SELECT *
      FROM payments
      WHERE order_id = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `)
    .bind(orderId)
    .first()) || null;
}

async function findOrderRecord(database, orderId) {
  if (!orderId) {
    return null;
  }

  return (await database
    .prepare(`SELECT * FROM orders WHERE id = ? LIMIT 1`)
    .bind(orderId)
    .first()) || null;
}

async function findPointTransaction(database, { orderId, kind } = {}) {
  if (!orderId || !kind) {
    return null;
  }

  return (await database
    .prepare(`SELECT * FROM point_transactions WHERE order_id = ? AND kind = ? LIMIT 1`)
    .bind(orderId, kind)
    .first()) || null;
}

async function insertPointTransaction(database, {
  userId,
  orderId,
  kind,
  pointsDelta,
  note = "",
  createdAt,
}) {
  if (!userId || !kind) {
    return false;
  }

  const existing = orderId ? await findPointTransaction(database, { orderId, kind }) : null;
  if (existing) {
    return false;
  }

  await database
    .prepare(`
      INSERT INTO point_transactions (
        user_id,
        order_id,
        kind,
        points_delta,
        note,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(
      userId,
      orderId || null,
      kind,
      Math.trunc(Number(pointsDelta) || 0),
      String(note || "").trim(),
      createdAt,
    )
    .run();

  return true;
}

async function readPointTransactionSum(database, userId) {
  if (!userId) {
    return 0;
  }

  const row = await database
    .prepare(`SELECT COALESCE(SUM(points_delta), 0) AS total FROM point_transactions WHERE user_id = ?`)
    .bind(userId)
    .first();

  return Math.trunc(Number(row?.total) || 0);
}

async function readUserBasePoints(database, userId) {
  if (!userId) {
    return 0;
  }

  const row = await database
    .prepare(`SELECT points_balance FROM users WHERE id = ? LIMIT 1`)
    .bind(userId)
    .first();

  return Math.trunc(Number(row?.points_balance) || 0);
}

async function readAvailablePoints(database, userId) {
  if (!userId) {
    return 0;
  }

  return (await readUserBasePoints(database, userId)) + (await readPointTransactionSum(database, userId));
}

function isPaymentConfirmedForPoints(order) {
  const orderStatus = String(order?.status || "").trim().toLowerCase();
  const paymentStatus = String(order?.payment_status || "").trim().toLowerCase();

  return ["paid"].includes(orderStatus)
    || ["confirmed", "paid", "done", "completed", "success", "succeeded"].includes(paymentStatus);
}

function isPaymentRevertedForPoints(order) {
  const orderStatus = String(order?.status || "").trim().toLowerCase();
  const paymentStatus = String(order?.payment_status || "").trim().toLowerCase();

  return ["payment_failed", "cancelled", "refunded"].includes(orderStatus)
    || ["failed", "cancelled", "canceled", "refunded", "refund"].includes(paymentStatus);
}

async function captureReservedPoints(database, order, now) {
  const pointsUsed = normalizePoints(order?.points_used);
  if (!order?.user_id || pointsUsed <= 0 || order?.points_spent_at || order?.points_refunded_at) {
    return false;
  }

  const released = Boolean(order?.points_released_at || await findPointTransaction(database, {
    orderId: order.id,
    kind: "reserve_release",
  }));
  const hasReserve = Boolean(await findPointTransaction(database, {
    orderId: order.id,
    kind: "reserve",
  }));

  await insertPointTransaction(database, {
    userId: order.user_id,
    orderId: order.id,
    kind: "spend_capture",
    pointsDelta: released || !hasReserve ? -pointsUsed : 0,
    note: released ? "Released reservation captured at payment confirmation." : "Point reservation captured at payment confirmation.",
    createdAt: now,
  });

  await database
    .prepare(`
      UPDATE orders
      SET points_spent_at = COALESCE(points_spent_at, ?),
          points_released_at = NULL,
          points_reservation_expires_at = NULL,
          updated_at = ?
      WHERE id = ?
    `)
    .bind(now, now, order.id)
    .run();

  return true;
}

async function releaseReservedPoints(database, order, now, note) {
  const pointsUsed = normalizePoints(order?.points_used);
  if (!order?.user_id || pointsUsed <= 0 || order?.points_spent_at || order?.points_released_at || order?.points_refunded_at) {
    return false;
  }

  await insertPointTransaction(database, {
    userId: order.user_id,
    orderId: order.id,
    kind: "reserve_release",
    pointsDelta: pointsUsed,
    note,
    createdAt: now,
  });

  await database
    .prepare(`
      UPDATE orders
      SET points_released_at = COALESCE(points_released_at, ?),
          points_reservation_expires_at = NULL,
          updated_at = ?
      WHERE id = ?
    `)
    .bind(now, now, order.id)
    .run();

  return true;
}

async function refundSpentPoints(database, order, now, note) {
  const pointsUsed = normalizePoints(order?.points_used);
  if (!order?.user_id || pointsUsed <= 0 || !order?.points_spent_at || order?.points_refunded_at) {
    return false;
  }

  await insertPointTransaction(database, {
    userId: order.user_id,
    orderId: order.id,
    kind: "spend_refund",
    pointsDelta: pointsUsed,
    note,
    createdAt: now,
  });

  await database
    .prepare(`
      UPDATE orders
      SET points_refunded_at = COALESCE(points_refunded_at, ?),
          updated_at = ?
      WHERE id = ?
    `)
    .bind(now, now, order.id)
    .run();

  return true;
}

async function awardEarnedPoints(database, order, now) {
  if (!order?.user_id || !isPaymentConfirmedForPoints(order) || order?.points_earned_at) {
    return false;
  }

  const earnedPoints = normalizePoints(order?.points_earned) || calculateEarnedPoints(order?.total_amount);
  if (earnedPoints <= 0) {
    return false;
  }

  await insertPointTransaction(database, {
    userId: order.user_id,
    orderId: order.id,
    kind: "earn",
    pointsDelta: earnedPoints,
    note: "Points awarded after delivery completed.",
    createdAt: now,
  });

  await database
    .prepare(`
      UPDATE orders
      SET points_earned = ?,
          points_earned_at = COALESCE(points_earned_at, ?),
          updated_at = ?
      WHERE id = ?
    `)
    .bind(earnedPoints, now, now, order.id)
    .run();

  return true;
}

async function reverseEarnedPoints(database, order, now, note) {
  const earnedPoints = normalizePoints(order?.points_earned);
  if (!order?.user_id || earnedPoints <= 0 || !order?.points_earned_at || order?.points_earned_reversed_at) {
    return false;
  }

  await insertPointTransaction(database, {
    userId: order.user_id,
    orderId: order.id,
    kind: "earn_reversal",
    pointsDelta: -earnedPoints,
    note,
    createdAt: now,
  });

  await database
    .prepare(`
      UPDATE orders
      SET points_earned_reversed_at = COALESCE(points_earned_reversed_at, ?),
          updated_at = ?
      WHERE id = ?
    `)
    .bind(now, now, order.id)
    .run();

  return true;
}

async function syncOrderPointsState(database, orderId, now, shipment = null) {
  const order = await findOrderRecord(database, orderId);
  if (!order || !order.user_id) {
    return false;
  }

  const currentShipment = shipment || await findShipmentRecord(database, { orderId });
  const shipmentStatus = String(currentShipment?.status || "").trim().toLowerCase();

  if (isPaymentConfirmedForPoints(order)) {
    await captureReservedPoints(database, order, now);
  }

  if (isPaymentRevertedForPoints(order)) {
    if (order?.points_spent_at) {
      await refundSpentPoints(database, order, now, "Points returned after payment was cancelled or refunded.");
    } else {
      await releaseReservedPoints(database, order, now, "Point reservation released after payment did not complete.");
    }

    await reverseEarnedPoints(database, order, now, "Awarded points reversed after payment was cancelled or refunded.");
    return true;
  }

  if (shipmentStatus === "delivered") {
    await awardEarnedPoints(database, order, now);
  }

  if (shipmentStatus === "returned") {
    await reverseEarnedPoints(database, order, now, "Awarded points reversed after order return.");
  }

  return true;
}

export async function settleExpiredPointReservations(env, {
  userId = null,
  excludeOrderId = null,
  now = new Date().toISOString(),
} = {}) {
  const database = getDb(env);
  if (!database) {
    return 0;
  }

  const result = await database
    .prepare(`
      SELECT *
      FROM orders
      WHERE user_id IS NOT NULL
        AND (? IS NULL OR user_id = ?)
        AND (? IS NULL OR id != ?)
        AND points_used > 0
        AND points_spent_at IS NULL
        AND points_released_at IS NULL
        AND points_refunded_at IS NULL
        AND points_reservation_expires_at IS NOT NULL
        AND points_reservation_expires_at <= ?
    `)
    .bind(userId, userId, excludeOrderId, excludeOrderId, now)
    .all();

  let settled = 0;

  for (const order of result?.results || []) {
    const changed = await releaseReservedPoints(database, order, now, "Point reservation expired.");
    if (changed) {
      settled += 1;
    }
  }

  return settled;
}

export async function readUserPointBalance(env, userId, options = {}) {
  const database = getDb(env);
  if (!database || !userId) {
    return 0;
  }

  if (options.settleExpired !== false) {
    await settleExpiredPointReservations(env, {
      userId,
      excludeOrderId: options.excludeOrderId || null,
    });
  }

  return readAvailablePoints(database, userId);
}

export async function prepareOrderPricing(env, {
  userId = null,
  email = "",
  subtotalAmount = 0,
  requestedPoints = 0,
  coupon = null,
} = {}) {
  const subtotal = roundAmount(subtotalAmount);
  let pointsUsed = normalizePoints(requestedPoints);
  const activeCoupon = coupon || await prepareCouponPricing(env, {
    userId,
    email,
    subtotalAmount: subtotal,
    couponCode: "",
  });
  const couponDiscountAmount = roundAmount(activeCoupon?.discountAmount);

  if (!getDb(env)) {
    if (couponDiscountAmount > 0 || pointsUsed > 0) {
      throw Object.assign(new Error("쿠폰 또는 포인트 사용 주문은 주문 API 연결이 필요합니다. 잠시 후 다시 시도해주세요."), {
        status: 503,
      });
    }

    return {
      subtotalAmount: subtotal,
      discountAmount: 0,
      couponDiscountAmount: 0,
      coupon: null,
      couponReservationExpiresAt: null,
      totalAmount: subtotal,
      pointsUsed: 0,
      pointsReservationExpiresAt: null,
      availablePoints: 0,
    };
  }

  if (!userId && pointsUsed > 0) {
    throw Object.assign(new Error("포인트는 로그인한 회원만 사용할 수 있습니다."), {
      status: 401,
    });
  }

  if (!userId || pointsUsed <= 0) {
    return {
      subtotalAmount: subtotal,
      discountAmount: couponDiscountAmount,
      couponDiscountAmount,
      coupon: activeCoupon,
      couponReservationExpiresAt: activeCoupon?.reservationExpiresAt || null,
      totalAmount: Math.max(0, subtotal - couponDiscountAmount),
      pointsUsed: 0,
      pointsReservationExpiresAt: null,
      availablePoints: userId ? await readUserPointBalance(env, userId) : 0,
    };
  }

  if (pointsUsed < POINTS_MIN_REDEEM) {
    throw Object.assign(new Error(`포인트는 ${POINTS_MIN_REDEEM.toLocaleString("ko-KR")}포인트부터 사용할 수 있습니다.`), {
      status: 400,
    });
  }

  pointsUsed = Math.min(pointsUsed, Math.max(0, subtotal - couponDiscountAmount));
  await settleExpiredCouponReservations(env);
  const availablePoints = await readUserPointBalance(env, userId);

  if (pointsUsed > availablePoints) {
    throw Object.assign(new Error("사용 가능한 포인트를 초과했습니다. 다시 확인해주세요."), {
      status: 400,
      details: {
        availablePoints,
      },
    });
  }

  const now = new Date().toISOString();

  return {
    subtotalAmount: subtotal,
    discountAmount: couponDiscountAmount + pointsUsed,
    couponDiscountAmount,
    coupon: activeCoupon,
    couponReservationExpiresAt: activeCoupon?.reservationExpiresAt || null,
    totalAmount: Math.max(0, subtotal - couponDiscountAmount - pointsUsed),
    pointsUsed,
    pointsReservationExpiresAt: buildPointsReservationExpiry(now),
    availablePoints,
  };
}

async function findShipmentRecord(database, { orderId } = {}) {
  if (!orderId) {
    return null;
  }

  return (await database
    .prepare(`SELECT * FROM shipments WHERE order_id = ? LIMIT 1`)
    .bind(orderId)
    .first()) || null;
}

async function findShipmentRecordByTracking(database, { carrierId, trackingNumber } = {}) {
  const safeTrackingNumber = String(trackingNumber || "").trim();
  if (!safeTrackingNumber) {
    return null;
  }

  const safeCarrierId = String(carrierId || "").trim();
  if (safeCarrierId) {
    return (await database
      .prepare(`SELECT * FROM shipments WHERE carrier_id = ? AND tracking_number = ? LIMIT 1`)
      .bind(safeCarrierId, safeTrackingNumber)
      .first()) || null;
  }

  return (await database
    .prepare(`SELECT * FROM shipments WHERE tracking_number = ? LIMIT 1`)
    .bind(safeTrackingNumber)
    .first()) || null;
}

function mapOrderSyncSnapshot(order, items, payment, shipment) {
  const normalizedItems = items.map((item) => ({
    lineId: item.line_id,
    productId: item.product_id || null,
    title: item.title,
    slug: item.slug || "",
    editionLabel: item.edition_label || "",
    unitPrice: roundAmount(item.unit_price),
    quantity: Number(item.quantity) || 0,
    snapshot: decodeJson(item.snapshot, null),
  }));

  return {
    orderId: order.id,
    userId: order.user_id || null,
    orderName: order.order_name,
    status: order.status,
    paymentStatus: order.payment_status,
    currency: order.currency || "KRW",
    subtotalAmount: roundAmount(order.subtotal_amount),
    shippingAmount: roundAmount(order.shipping_amount),
    discountAmount: roundAmount(order.discount_amount),
    coupon: order.coupon_id ? {
      couponId: order.coupon_id,
      code: order.coupon_code || "",
      title: order.coupon_title || "",
      scope: order.coupon_scope || "",
      discountType: order.coupon_discount_type || "",
      discountValue: roundAmount(order.coupon_discount_value),
      discountAmount: roundAmount(order.coupon_discount_amount),
      reservationExpiresAt: normalizeTimestamp(order.coupon_reservation_expires_at),
      reservedAt: normalizeTimestamp(order.coupon_reserved_at),
      releasedAt: normalizeTimestamp(order.coupon_released_at),
      appliedAt: normalizeTimestamp(order.coupon_applied_at),
      reinstatedAt: normalizeTimestamp(order.coupon_reinstated_at),
    } : null,
    pointsUsed: normalizePoints(order.points_used),
    pointsEarned: normalizePoints(order.points_earned),
    totalAmount: roundAmount(order.total_amount),
    itemCount: normalizedItems.reduce((sum, item) => sum + Math.max(item.quantity, 0), 0),
    customer: {
      name: order.customer_name,
      phone: order.customer_phone,
      email: order.customer_email,
    },
    shipping: {
      zipcode: order.zipcode,
      address1: order.address1,
      address2: order.address2 || "",
      note: order.note || "",
    },
    createdAt: normalizeTimestamp(order.created_at),
    updatedAt: normalizeTimestamp(order.updated_at),
    paidAt: normalizeTimestamp(order.paid_at),
    cancelledAt: normalizeTimestamp(order.cancelled_at),
    activePaymentKey: order.active_payment_key || null,
    pointsReservationExpiresAt: normalizeTimestamp(order.points_reservation_expires_at),
    pointsSpentAt: normalizeTimestamp(order.points_spent_at),
    pointsReleasedAt: normalizeTimestamp(order.points_released_at),
    pointsRefundedAt: normalizeTimestamp(order.points_refunded_at),
    pointsEarnedAt: normalizeTimestamp(order.points_earned_at),
    pointsEarnedReversedAt: normalizeTimestamp(order.points_earned_reversed_at),
    items: normalizedItems,
    shipment: mapShipmentRecord(shipment),
    payment: payment ? {
      paymentKey: payment.payment_key,
      provider: payment.provider,
      providerMode: payment.provider_mode,
      tossOrderId: payment.toss_order_id || null,
      method: payment.method || null,
      status: payment.status,
      requestedAmount: roundAmount(payment.requested_amount),
      approvedAmount: payment.approved_amount == null ? null : roundAmount(payment.approved_amount),
      requestedAt: normalizeTimestamp(payment.requested_at),
      approvedAt: normalizeTimestamp(payment.approved_at),
      failedAt: normalizeTimestamp(payment.failed_at),
      cancelledAt: normalizeTimestamp(payment.cancelled_at),
      rawRequest: decodeJson(payment.raw_request, null),
      rawResponse: decodeJson(payment.raw_response, null),
    } : null,
  };
}

export async function readOrderSyncSnapshot(env, orderId) {
  const database = getDb(env);
  if (!database || !orderId) {
    return null;
  }

  const order = await findOrderRecord(database, orderId);

  if (!order) {
    return null;
  }

  const itemsResult = await database
    .prepare(`
      SELECT *
      FROM order_items
      WHERE order_id = ?
      ORDER BY id ASC
    `)
    .bind(orderId)
    .all();

  const payment = await findPaymentRecord(database, { orderId });
  const shipment = await findShipmentRecord(database, { orderId });

  return mapOrderSyncSnapshot(order, itemsResult?.results || [], payment, shipment);
}

async function ensureShipmentRecord(database, { orderId, status = "confirmed", now }) {
  if (!orderId) {
    return null;
  }

  const existing = await findShipmentRecord(database, { orderId });
  const nextStatus = normalizeShipmentStatus(status);

  if (existing) {
    await database
      .prepare(`
        UPDATE shipments
        SET status = CASE WHEN status = 'confirmed' THEN ? ELSE status END,
            updated_at = ?
        WHERE order_id = ?
      `)
      .bind(nextStatus, now, orderId)
      .run();

    return findShipmentRecord(database, { orderId });
  }

  await database
    .prepare(`
      INSERT INTO shipments (
        order_id,
        status,
        carrier_id,
        carrier,
        tracking_number,
        tracking_url,
        tracker_registered_at,
        tracker_last_synced_at,
        tracker_last_event_at,
        tracker_last_event_code,
        tracker_last_event_name,
        tracker_last_event_description,
        shipped_at,
        delivered_at,
        created_at,
        updated_at
      ) VALUES (?, ?, '', '', '', '', NULL, NULL, NULL, '', '', '', NULL, NULL, ?, ?)
    `)
    .bind(orderId, nextStatus, now, now)
    .run();

  return findShipmentRecord(database, { orderId });
}

export async function updateShipment(env, input) {
  const database = getDb(env);
  if (!database || !input?.orderId) return null;

  const now = new Date().toISOString();
  const existing = await ensureShipmentRecord(database, {
    orderId: input.orderId,
    status: input.status || "confirmed",
    now,
  });

  if (!existing) {
    return null;
  }

  const nextStatus = normalizeShipmentStatus(input.status, normalizeShipmentStatus(existing.status));
  const shippedAt =
    nextStatus === "shipped"
      ? normalizeTimestamp(input.shippedAt) || normalizeTimestamp(existing.shipped_at) || now
      : normalizeTimestamp(existing.shipped_at);
  const deliveredAt =
    nextStatus === "delivered"
      ? normalizeTimestamp(input.deliveredAt) || normalizeTimestamp(existing.delivered_at) || now
      : normalizeTimestamp(existing.delivered_at);

  await database
    .prepare(`
      UPDATE shipments
      SET status = ?,
          carrier_id = ?,
          carrier = ?,
          tracking_number = ?,
          tracking_url = ?,
          tracker_registered_at = ?,
          tracker_last_synced_at = ?,
          tracker_last_event_at = ?,
          tracker_last_event_code = ?,
          tracker_last_event_name = ?,
          tracker_last_event_description = ?,
          shipped_at = ?,
          delivered_at = ?,
          updated_at = ?
      WHERE order_id = ?
    `)
    .bind(
      nextStatus,
      String(input.carrierId ?? existing.carrier_id ?? "").trim(),
      String(input.carrier ?? existing.carrier ?? "").trim(),
      String(input.trackingNumber ?? existing.tracking_number ?? "").trim(),
      String(input.trackingUrl ?? existing.tracking_url ?? "").trim(),
      normalizeTimestamp(input.trackerRegisteredAt) || normalizeTimestamp(existing.tracker_registered_at),
      normalizeTimestamp(input.trackerLastSyncedAt) || normalizeTimestamp(existing.tracker_last_synced_at),
      normalizeTimestamp(input.trackerLastEventAt) || normalizeTimestamp(existing.tracker_last_event_at),
      String(input.trackerLastEventCode ?? existing.tracker_last_event_code ?? "").trim(),
      String(input.trackerLastEventName ?? existing.tracker_last_event_name ?? "").trim(),
      String(input.trackerLastEventDescription ?? existing.tracker_last_event_description ?? "").trim(),
      shippedAt,
      deliveredAt,
      now,
      input.orderId,
    )
    .run();

  const shipment = await findShipmentRecord(database, { orderId: input.orderId });
  await syncOrderPointsState(database, input.orderId, now, shipment);
  return shipment;
}

export async function updateShipmentByTrackingReference(env, input) {
  const database = getDb(env);
  if (!database) return null;

  const existing = await findShipmentRecordByTracking(database, {
    carrierId: input?.carrierId,
    trackingNumber: input?.trackingNumber,
  });

  if (!existing) {
    return null;
  }

  const now = new Date().toISOString();
  const nextStatus = normalizeShipmentStatus(input?.status, normalizeShipmentStatus(existing.status));
  const trackerLastEventAt = normalizeTimestamp(input?.trackerLastEventAt) || normalizeTimestamp(existing.tracker_last_event_at);
  const shippedAt =
    nextStatus === "shipped"
      ? trackerLastEventAt || normalizeTimestamp(existing.shipped_at) || now
      : normalizeTimestamp(existing.shipped_at);
  const deliveredAt =
    nextStatus === "delivered"
      ? trackerLastEventAt || normalizeTimestamp(existing.delivered_at) || now
      : normalizeTimestamp(existing.delivered_at);

  await database
    .prepare(`
      UPDATE shipments
      SET status = ?,
          tracking_url = ?,
          tracker_last_synced_at = ?,
          tracker_last_event_at = ?,
          tracker_last_event_code = ?,
          tracker_last_event_name = ?,
          tracker_last_event_description = ?,
          shipped_at = ?,
          delivered_at = ?,
          updated_at = ?
      WHERE id = ?
    `)
    .bind(
      nextStatus,
      String(input?.trackingUrl ?? existing.tracking_url ?? "").trim(),
      now,
      trackerLastEventAt,
      String(input?.trackerLastEventCode ?? existing.tracker_last_event_code ?? "").trim(),
      String(input?.trackerLastEventName ?? existing.tracker_last_event_name ?? "").trim(),
      String(input?.trackerLastEventDescription ?? existing.tracker_last_event_description ?? "").trim(),
      shippedAt,
      deliveredAt,
      now,
      existing.id,
    )
    .run();

  await syncOrderPointsState(database, existing.order_id, now);

  return {
    orderId: existing.order_id,
    shipment: await findShipmentRecord(database, { orderId: existing.order_id }),
  };
}

export async function readFulfillmentOrders(env, { query = "", limit = 20 } = {}) {
  const database = getDb(env);
  if (!database) {
    return [];
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
  const safeQuery = String(query || "").trim();
  const hasQuery = Boolean(safeQuery);
  const searchValue = `%${safeQuery.toLowerCase()}%`;

  const result = await database
    .prepare(`
      SELECT id
      FROM orders
      WHERE (? = '' OR lower(id) LIKE ? OR lower(order_name) LIKE ? OR lower(customer_name) LIKE ? OR lower(customer_email) LIKE ? OR lower(coupon_code) LIKE ?)
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .bind(
      hasQuery ? safeQuery : "",
      searchValue,
      searchValue,
      searchValue,
      searchValue,
      searchValue,
      safeLimit,
    )
    .all();

  const rows = result?.results || [];
  const orders = [];

  for (const row of rows) {
    const snapshot = await readOrderSyncSnapshot(env, row.id);
    if (snapshot) {
      orders.push(snapshot);
    }
  }

  return orders;
}

function shouldApplyOrderLifecycle({ currentStatus, activePaymentKey, paymentKey, lifecycle }) {
  if (!paymentKey || !lifecycle) {
    return true;
  }

  if (lifecycle.orderStatus === "paid" || lifecycle.orderStatus === "payment_pending") {
    return true;
  }

  if (!activePaymentKey || activePaymentKey === paymentKey) {
    return true;
  }

  if (lifecycle.orderStatus === "payment_failed") {
    return currentStatus !== "paid";
  }

  return false;
}

async function updateOrderState(database, {
  orderId,
  paymentKey,
  lifecycle,
  approvedAt,
  cancelledAt,
  now,
}) {
  if (!orderId || !lifecycle) {
    return false;
  }

  const order = await database
    .prepare(`SELECT id, status, active_payment_key FROM orders WHERE id = ? LIMIT 1`)
    .bind(orderId)
    .first();

  if (!order) {
    return false;
  }

  const activePaymentKey = order.active_payment_key || null;
  const currentStatus = String(order.status || "");

  if (!shouldApplyOrderLifecycle({ currentStatus, activePaymentKey, paymentKey, lifecycle })) {
    return false;
  }

  await database
    .prepare(`
      UPDATE orders
      SET status = ?,
          payment_status = ?,
          active_payment_key = ?,
          paid_at = COALESCE(?, paid_at),
          cancelled_at = COALESCE(?, cancelled_at),
          updated_at = ?
      WHERE id = ?
    `)
    .bind(
      lifecycle.orderStatus,
      lifecycle.paymentStatus,
      paymentKey || activePaymentKey,
      approvedAt || null,
      cancelledAt || null,
      now,
      orderId,
    )
    .run();

  return true;
}

async function upsertPaymentRecord(database, input) {
  const existing = await findPaymentRecord(database, {
    paymentKey: input.paymentKey,
    orderId: input.orderId,
  });

  const paymentKey = String(input.paymentKey || existing?.payment_key || "").trim();
  if (!paymentKey) {
    return existing;
  }

  const now = input.now;
  const requestedAmount =
    roundAmount(input.amount) ||
    roundAmount(input.requestedAmount) ||
    roundAmount(existing?.requested_amount);

  if (requestedAmount <= 0) {
    return existing;
  }

  const approvedAmount =
    input.lifecycle.paymentStatus === "confirmed" || input.lifecycle.paymentStatus === "refunded"
      ? roundAmount(input.amount) || roundAmount(existing?.approved_amount)
      : roundAmount(existing?.approved_amount) || null;

  const approvedAt =
    input.lifecycle.paymentStatus === "confirmed"
      ? normalizeTimestamp(input.approvedAt) || normalizeTimestamp(existing?.approved_at) || now
      : normalizeTimestamp(existing?.approved_at);

  const failedAt =
    input.lifecycle.paymentStatus === "failed"
      ? normalizeTimestamp(input.failedAt) || now
      : normalizeTimestamp(existing?.failed_at);

  const cancelledAt =
    input.lifecycle.paymentStatus === "cancelled" || input.lifecycle.paymentStatus === "refunded"
      ? normalizeTimestamp(input.cancelledAt) || now
      : normalizeTimestamp(existing?.cancelled_at);

  if (existing) {
    await database
      .prepare(`
        UPDATE payments
        SET order_id = ?,
            provider = ?,
            provider_mode = ?,
            toss_order_id = ?,
            method = ?,
            status = ?,
            requested_amount = ?,
            approved_amount = ?,
            raw_request = ?,
            raw_response = ?,
            requested_at = ?,
            approved_at = ?,
            failed_at = ?,
            cancelled_at = ?,
            updated_at = ?
        WHERE id = ?
      `)
      .bind(
        input.orderId || existing.order_id,
        input.provider || existing.provider || "toss",
        input.providerMode || existing.provider_mode || "preview",
        input.tossOrderId || existing.toss_order_id || input.orderId || existing.order_id,
        input.method || existing.method || null,
        input.lifecycle.paymentStatus,
        requestedAmount,
        approvedAmount,
        input.rawRequest !== undefined ? encodeJson(input.rawRequest) : existing.raw_request,
        input.rawResponse !== undefined ? encodeJson(input.rawResponse, null) : existing.raw_response,
        normalizeTimestamp(input.requestedAt) || existing.requested_at || now,
        approvedAt,
        failedAt,
        cancelledAt,
        now,
        existing.id,
      )
      .run();

    return findPaymentRecord(database, { paymentKey });
  }

  await database
    .prepare(`
      INSERT INTO payments (
        order_id,
        payment_key,
        provider,
        provider_mode,
        toss_order_id,
        method,
        status,
        requested_amount,
        approved_amount,
        raw_request,
        raw_response,
        requested_at,
        approved_at,
        failed_at,
        cancelled_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      input.orderId,
      paymentKey,
      input.provider || "toss",
      input.providerMode || "preview",
      input.tossOrderId || input.orderId,
      input.method || null,
      input.lifecycle.paymentStatus,
      requestedAmount,
      approvedAmount,
      encodeJson(input.rawRequest),
      encodeJson(input.rawResponse, null),
      normalizeTimestamp(input.requestedAt) || now,
      approvedAt,
      failedAt,
      cancelledAt,
      now,
      now,
    )
    .run();

  return findPaymentRecord(database, { paymentKey });
}

async function upsertPaymentEvent(database, {
  orderId,
  paymentId,
  provider,
  eventType,
  deliveryId,
  payload,
  receivedAt,
  processedAt,
}) {
  const duplicate =
    Boolean(deliveryId) &&
    Boolean(
      await database
        .prepare(`SELECT id FROM payment_events WHERE provider = ? AND delivery_id = ? LIMIT 1`)
        .bind(provider, deliveryId)
        .first(),
    );

  await database
    .prepare(`
      INSERT INTO payment_events (
        order_id,
        payment_id,
        provider,
        event_type,
        delivery_id,
        payload,
        received_at,
        processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, delivery_id) DO UPDATE SET
        order_id = COALESCE(excluded.order_id, payment_events.order_id),
        payment_id = COALESCE(excluded.payment_id, payment_events.payment_id),
        event_type = excluded.event_type,
        payload = excluded.payload,
        processed_at = COALESCE(payment_events.processed_at, excluded.processed_at)
    `)
    .bind(
      orderId || null,
      paymentId || null,
      provider,
      eventType,
      deliveryId || null,
      encodeJson(payload, null),
      receivedAt,
      processedAt || null,
    )
    .run();

  return { duplicate };
}

export async function persistOrder(env, order) {
  const database = getDb(env);
  if (!database) return false;

  const createdAt = order.createdAt || new Date().toISOString();
  const updatedAt = createdAt;

  const statements = [
    database.prepare(`
      INSERT INTO orders (
        id,
        user_id,
        order_name,
        status,
        payment_status,
        currency,
        subtotal_amount,
        shipping_amount,
        discount_amount,
        points_used,
        points_earned,
        total_amount,
        customer_name,
        customer_phone,
        customer_email,
        zipcode,
        address1,
        address2,
        note,
        coupon_id,
        coupon_code,
        coupon_title,
        coupon_scope,
        coupon_discount_type,
        coupon_discount_value,
        coupon_discount_amount,
        coupon_reservation_expires_at,
        coupon_reserved_at,
        coupon_released_at,
        coupon_applied_at,
        coupon_reinstated_at,
        points_reservation_expires_at,
        created_at,
        updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      order.orderId,
      order.userId || null,
      order.orderName,
      order.status || "created",
      order.paymentStatus || "pending",
      "KRW",
      order.subtotalAmount ?? order.total,
      0,
      order.discountAmount ?? 0,
      order.pointsUsed ?? 0,
      order.pointsEarned ?? 0,
      order.total,
      order.shipping.name,
      order.shipping.phone,
      order.shipping.email,
      order.shipping.zipcode,
      order.shipping.address1,
      order.shipping.address2 || "",
      order.shipping.memo || "",
      order.couponId || null,
      order.couponCode || "",
      order.couponTitle || "",
      order.couponScope || "",
      order.couponDiscountType || "",
      order.couponDiscountValue || 0,
      order.couponDiscountAmount || 0,
      order.couponReservationExpiresAt || null,
      null,
      null,
      null,
      null,
      order.pointsReservationExpiresAt || null,
      createdAt,
      updatedAt,
    ),
  ];

  for (const item of order.items) {
    statements.push(
      database.prepare(`
        INSERT INTO order_items (
          order_id,
          line_id,
          product_id,
          title,
          slug,
          edition_label,
          unit_price,
          quantity,
          snapshot,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        order.orderId,
        item.lineId,
        item.productId,
        item.title,
        item.slug || "",
        item.editionLabel || null,
        item.price,
        item.qty,
        encodeJson(item),
        createdAt,
      ),
    );
  }

  await database.batch(statements);

  if (order.couponCode) {
    try {
      await reserveCouponForOrder(env, order, createdAt);
    } catch (error) {
      await database.prepare(`DELETE FROM orders WHERE id = ?`).bind(order.orderId).run();
      throw error;
    }
  }

  if (order.userId && normalizePoints(order.pointsUsed) > 0) {
    const availablePoints = await readAvailablePoints(database, order.userId);
    if (order.pointsUsed > availablePoints) {
      await database.prepare(`DELETE FROM orders WHERE id = ?`).bind(order.orderId).run();
      throw Object.assign(new Error("사용 가능한 포인트가 부족합니다. 다시 시도해주세요."), {
        status: 409,
      });
    }

    try {
      await insertPointTransaction(database, {
        userId: order.userId,
        orderId: order.orderId,
        kind: "reserve",
        pointsDelta: -normalizePoints(order.pointsUsed),
        note: "Point reservation created at order checkout.",
        createdAt,
      });
    } catch (error) {
      await database.prepare(`DELETE FROM orders WHERE id = ?`).bind(order.orderId).run();
      throw error;
    }
  }

  return true;
}

export async function persistPayment(env, payment) {
  const database = getDb(env);
  if (!database) return false;

  const now = new Date().toISOString();
  const lifecycle = getPaymentLifecycle(payment.status, { defaultToPending: true });

  const paymentRecord = await upsertPaymentRecord(database, {
    orderId: payment.orderId,
    paymentKey: payment.paymentKey,
    provider: payment.provider || "toss",
    providerMode: payment.providerMode || "preview",
    tossOrderId: payment.orderId,
    method: payment.method || null,
    lifecycle,
    amount: payment.amount,
    rawRequest: payment.rawRequest,
    rawResponse: payment.rawResponse || payment,
    approvedAt: payment.approvedAt,
    cancelledAt: payment.cancelledAt,
    failedAt: payment.failedAt,
    requestedAt: now,
    now,
  });

  if (!paymentRecord) {
    throw Object.assign(new Error("Could not persist payment record."), {
      status: 502,
    });
  }

  const orderUpdated = await updateOrderState(database, {
    orderId: payment.orderId,
    paymentKey: paymentRecord.payment_key,
    lifecycle,
    approvedAt: paymentRecord.approved_at,
    cancelledAt: paymentRecord.cancelled_at,
    now,
  });

  if (!orderUpdated) {
    throw Object.assign(new Error("Could not update order payment state."), {
      status: 502,
    });
  }

  if (lifecycle.paymentStatus === "confirmed") {
    await ensureShipmentRecord(database, {
      orderId: payment.orderId,
      status: "confirmed",
      now,
    });
  }

  await syncOrderCouponState(env, payment.orderId, { now });
  await syncOrderPointsState(database, payment.orderId, now);

  await upsertPaymentEvent(database, {
    orderId: payment.orderId,
    paymentId: paymentRecord.id,
    provider: payment.provider || "toss",
    eventType: lifecycle.eventType,
    deliveryId: null,
    payload: payment.rawResponse || payment,
    receivedAt: now,
    processedAt: now,
  });

  return true;
}

export async function persistWebhookEvent(env, payload, options = {}) {
  const database = getDb(env);
  if (!database) return false;

  const now = new Date().toISOString();
  const lifecycle = getPaymentLifecycle(inferPaymentStatus(payload));
  const deliveryId = inferDeliveryId(payload, options.deliveryId);
  const paymentKey = inferPaymentKey(payload);
  let orderId = inferOrderId(payload);

  let paymentRecord = await findPaymentRecord(database, { paymentKey, orderId });

  if (lifecycle && (paymentKey || orderId)) {
    paymentRecord = await upsertPaymentRecord(database, {
      orderId: orderId || paymentRecord?.order_id,
      paymentKey,
      provider: "toss",
      providerMode: "toss-webhook",
      tossOrderId: inferTossOrderId(payload) || orderId || paymentRecord?.order_id,
      method: inferPaymentMethod(payload) || paymentRecord?.method || null,
      lifecycle,
      amount: inferPaymentAmount(payload) || paymentRecord?.requested_amount,
      rawRequest: payload,
      rawResponse: payload,
      approvedAt: inferApprovedAt(payload) || paymentRecord?.approved_at,
      cancelledAt: inferCancelledAt(payload) || paymentRecord?.cancelled_at,
      failedAt: lifecycle.paymentStatus === "failed" ? now : paymentRecord?.failed_at,
      requestedAt: paymentRecord?.requested_at || now,
      now,
    });
  }

  orderId = orderId || paymentRecord?.order_id || null;

  const orderUpdated = await updateOrderState(database, {
    orderId,
    paymentKey: paymentKey || paymentRecord?.payment_key || null,
    lifecycle,
    approvedAt: inferApprovedAt(payload) || paymentRecord?.approved_at || null,
    cancelledAt: inferCancelledAt(payload) || paymentRecord?.cancelled_at || null,
    now,
  });

  if (lifecycle?.paymentStatus === "confirmed" && orderId) {
    await ensureShipmentRecord(database, {
      orderId,
      status: "confirmed",
      now,
    });
  }

  if (orderId) {
    await syncOrderCouponState(env, orderId, { now });
    await syncOrderPointsState(database, orderId, now);
  }

  const eventResult = await upsertPaymentEvent(database, {
    orderId,
    paymentId: paymentRecord?.id || null,
    provider: "toss",
    eventType: inferEventType(payload, lifecycle),
    deliveryId,
    payload,
    receivedAt: now,
    processedAt: lifecycle ? now : null,
  });

  return {
    persisted: true,
    duplicate: eventResult.duplicate,
    orderId,
    orderUpdated,
    paymentUpdated: Boolean(paymentRecord && lifecycle),
  };
}