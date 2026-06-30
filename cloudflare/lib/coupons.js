function getDb(env) {
  return env?.OALUM_DB || null;
}

const COUPON_RESERVATION_WINDOW_MS = 30 * 60 * 1000;

function roundAmount(value) {
  const amount = Math.round(Number(value) || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeTimestamp(value) {
  const timestamp = String(value || "").trim();
  return timestamp || null;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeCouponCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-_]/g, "");
}

function normalizeCouponScope(value) {
  return String(value || "").trim().toLowerCase() === "public" ? "public" : "targeted";
}

function normalizeCouponDiscountType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "percent" ? "percent" : "fixed";
}

function normalizeUsageLimit(value, fallback = 1) {
  const limit = Math.trunc(Number(value) || 0);
  return Math.max(1, Math.min(limit || fallback, 99999));
}

function generateCouponId() {
  return `OALUM-CPN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`.toUpperCase();
}

function generateCouponCode(scope = "targeted") {
  const prefix = scope === "public" ? "OALUM" : "MEM";
  return `${prefix}-${Math.random().toString(36).slice(2, 6)}-${Date.now().toString(36).slice(-4)}`.toUpperCase();
}

function buildCouponReservationExpiry(now) {
  return new Date(new Date(now).getTime() + COUPON_RESERVATION_WINDOW_MS).toISOString();
}

function isPaymentConfirmed(order) {
  const orderStatus = String(order?.status || "").trim().toLowerCase();
  const paymentStatus = String(order?.payment_status || "").trim().toLowerCase();

  return ["paid"].includes(orderStatus)
    || ["confirmed", "paid", "done", "completed", "success", "succeeded"].includes(paymentStatus);
}

function isPaymentReverted(order) {
  const orderStatus = String(order?.status || "").trim().toLowerCase();
  const paymentStatus = String(order?.payment_status || "").trim().toLowerCase();

  return ["payment_failed", "cancelled", "refunded"].includes(orderStatus)
    || ["failed", "cancelled", "canceled", "refunded", "refund"].includes(paymentStatus);
}

function computeCouponDiscount(subtotalAmount, coupon) {
  const subtotal = roundAmount(subtotalAmount);
  const type = normalizeCouponDiscountType(coupon?.discount_type || coupon?.discountType);
  const rawValue = roundAmount(coupon?.discount_value ?? coupon?.discountValue);
  const maxDiscount = roundAmount(coupon?.maximum_discount_amount ?? coupon?.maximumDiscountAmount);

  if (subtotal <= 0 || rawValue <= 0) {
    return 0;
  }

  let discount = type === "percent"
    ? Math.floor(subtotal * (Math.min(rawValue, 99) / 100))
    : rawValue;

  if (maxDiscount > 0) {
    discount = Math.min(discount, maxDiscount);
  }

  return Math.max(0, Math.min(subtotal, discount));
}

function mapCouponRecord(row) {
  if (!row) {
    return null;
  }

  const usageLimit = normalizeUsageLimit(row.usage_limit, 1);
  const activeUseCount = Math.max(0, Math.trunc(Number(row.active_use_count) || 0));
  const appliedUseCount = Math.max(0, Math.trunc(Number(row.applied_use_count) || 0));

  return {
    id: row.id,
    code: row.code,
    title: row.title,
    scope: normalizeCouponScope(row.scope),
    userId: row.user_id || null,
    targetEmail: row.email_normalized || "",
    discountType: normalizeCouponDiscountType(row.discount_type),
    discountValue: roundAmount(row.discount_value),
    minimumOrderAmount: roundAmount(row.minimum_order_amount),
    maximumDiscountAmount: row.maximum_discount_amount == null ? null : roundAmount(row.maximum_discount_amount),
    usageLimit,
    activeUseCount,
    appliedUseCount,
    remainingUses: Math.max(0, usageLimit - activeUseCount),
    isActive: Boolean(Number(row.is_active)),
    startsAt: normalizeTimestamp(row.starts_at),
    expiresAt: normalizeTimestamp(row.expires_at),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
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

async function findShipmentRecord(database, orderId) {
  if (!orderId) {
    return null;
  }

  return (await database
    .prepare(`SELECT status FROM shipments WHERE order_id = ? LIMIT 1`)
    .bind(orderId)
    .first()) || null;
}

async function findCouponById(database, couponId) {
  if (!couponId) {
    return null;
  }

  return (await database
    .prepare(`SELECT * FROM coupons WHERE id = ? LIMIT 1`)
    .bind(couponId)
    .first()) || null;
}

async function findCouponByCode(database, couponCode) {
  const normalizedCode = normalizeCouponCode(couponCode);
  if (!normalizedCode) {
    return null;
  }

  return (await database
    .prepare(`SELECT * FROM coupons WHERE code = ? LIMIT 1`)
    .bind(normalizedCode)
    .first()) || null;
}

async function findCouponRedemption(database, { couponId, orderId } = {}) {
  if (!couponId || !orderId) {
    return null;
  }

  return (await database
    .prepare(`SELECT * FROM coupon_redemptions WHERE coupon_id = ? AND order_id = ? LIMIT 1`)
    .bind(couponId, orderId)
    .first()) || null;
}

async function resolveUserIdByEmail(database, emailNormalized) {
  if (!emailNormalized) {
    return null;
  }

  const user = await database
    .prepare(`SELECT id FROM users WHERE email_normalized = ? LIMIT 1`)
    .bind(emailNormalized)
    .first();

  return user?.id || null;
}

async function readCouponUsageStats(database, couponId, { excludeOrderId = null } = {}) {
  if (!couponId) {
    return {
      activeUseCount: 0,
      appliedUseCount: 0,
    };
  }

  const row = await database
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('reserved', 'applied') THEN 1 ELSE 0 END), 0) AS active_use_count,
        COALESCE(SUM(CASE WHEN status = 'applied' THEN 1 ELSE 0 END), 0) AS applied_use_count
      FROM coupon_redemptions
      WHERE coupon_id = ?
        AND (? IS NULL OR order_id != ?)
    `)
    .bind(couponId, excludeOrderId, excludeOrderId)
    .first();

  return {
    activeUseCount: Math.max(0, Math.trunc(Number(row?.active_use_count) || 0)),
    appliedUseCount: Math.max(0, Math.trunc(Number(row?.applied_use_count) || 0)),
  };
}

async function readCouponWithStatsById(database, couponId) {
  if (!couponId) {
    return null;
  }

  const row = await database
    .prepare(`
      SELECT
        coupons.*,
        COALESCE(SUM(CASE WHEN coupon_redemptions.status IN ('reserved', 'applied') THEN 1 ELSE 0 END), 0) AS active_use_count,
        COALESCE(SUM(CASE WHEN coupon_redemptions.status = 'applied' THEN 1 ELSE 0 END), 0) AS applied_use_count
      FROM coupons
      LEFT JOIN coupon_redemptions ON coupon_redemptions.coupon_id = coupons.id
      WHERE coupons.id = ?
      GROUP BY coupons.id
      LIMIT 1
    `)
    .bind(couponId)
    .first();

  return mapCouponRecord(row);
}

async function resolveCouponForPricing(database, {
  couponCode,
  userId = null,
  emailNormalized = "",
  subtotalAmount = 0,
  now = new Date().toISOString(),
  excludeOrderId = null,
} = {}) {
  const normalizedCode = normalizeCouponCode(couponCode);
  if (!normalizedCode) {
    return null;
  }

  const coupon = await findCouponByCode(database, normalizedCode);
  if (!coupon) {
    throw Object.assign(new Error("유효한 쿠폰을 찾지 못했습니다."), {
      status: 404,
    });
  }

  if (!Number(coupon.is_active)) {
    throw Object.assign(new Error("현재 사용할 수 없는 쿠폰입니다."), {
      status: 400,
    });
  }

  const startsAt = normalizeTimestamp(coupon.starts_at);
  const expiresAt = normalizeTimestamp(coupon.expires_at);

  if (startsAt && startsAt > now) {
    throw Object.assign(new Error("아직 사용할 수 없는 쿠폰입니다."), {
      status: 400,
    });
  }

  if (expiresAt && expiresAt < now) {
    throw Object.assign(new Error("사용 기한이 지난 쿠폰입니다."), {
      status: 400,
    });
  }

  const scope = normalizeCouponScope(coupon.scope);
  const normalizedEmail = normalizeEmail(emailNormalized);

  if (scope === "targeted") {
    const matchesUser = coupon.user_id && userId && coupon.user_id === userId;
    const matchesEmail = coupon.email_normalized && normalizedEmail && coupon.email_normalized === normalizedEmail;

    if (!matchesUser && !matchesEmail) {
      throw Object.assign(new Error("이 쿠폰은 지정된 계정 또는 이메일에서만 사용할 수 있습니다."), {
        status: 403,
      });
    }
  }

  const minimumOrderAmount = roundAmount(coupon.minimum_order_amount);
  const subtotal = roundAmount(subtotalAmount);

  if (subtotal < minimumOrderAmount) {
    throw Object.assign(new Error(`이 쿠폰은 ${minimumOrderAmount.toLocaleString("ko-KR")}원 이상 주문에서 사용할 수 있습니다.`), {
      status: 400,
      details: {
        minimumOrderAmount,
      },
    });
  }

  const usageStats = await readCouponUsageStats(database, coupon.id, { excludeOrderId });
  const usageLimit = normalizeUsageLimit(coupon.usage_limit, 1);

  if (usageStats.activeUseCount >= usageLimit) {
    throw Object.assign(new Error("현재 사용 가능한 수량이 모두 소진된 쿠폰입니다."), {
      status: 409,
    });
  }

  const discountAmount = computeCouponDiscount(subtotal, coupon);
  if (discountAmount <= 0) {
    throw Object.assign(new Error("현재 주문에는 쿠폰 할인이 적용되지 않습니다."), {
      status: 400,
    });
  }

  const mapped = mapCouponRecord({
    ...coupon,
    active_use_count: usageStats.activeUseCount,
    applied_use_count: usageStats.appliedUseCount,
  });

  return {
    ...mapped,
    discountAmount,
    reservationExpiresAt: buildCouponReservationExpiry(now),
  };
}

async function captureReservedCoupon(database, order, now) {
  if (!order?.coupon_id) {
    return false;
  }

  await database
    .prepare(`
      UPDATE coupon_redemptions
      SET status = 'applied',
          updated_at = ?
      WHERE coupon_id = ?
        AND order_id = ?
    `)
    .bind(now, order.coupon_id, order.id)
    .run();

  await database
    .prepare(`
      UPDATE orders
      SET coupon_applied_at = COALESCE(coupon_applied_at, ?),
          coupon_released_at = NULL,
          coupon_reservation_expires_at = NULL,
          updated_at = ?
      WHERE id = ?
    `)
    .bind(now, now, order.id)
    .run();

  return true;
}

async function releaseReservedCoupon(database, order, now) {
  if (!order?.coupon_id || order?.coupon_released_at) {
    return false;
  }

  await database
    .prepare(`
      UPDATE coupon_redemptions
      SET status = 'released',
          updated_at = ?
      WHERE coupon_id = ?
        AND order_id = ?
    `)
    .bind(now, order.coupon_id, order.id)
    .run();

  await database
    .prepare(`
      UPDATE orders
      SET coupon_released_at = COALESCE(coupon_released_at, ?),
          coupon_reinstated_at = CASE
            WHEN coupon_applied_at IS NOT NULL THEN COALESCE(coupon_reinstated_at, ?)
            ELSE coupon_reinstated_at
          END,
          coupon_reservation_expires_at = NULL,
          updated_at = ?
      WHERE id = ?
    `)
    .bind(now, now, now, order.id)
    .run();

  return true;
}

export async function settleExpiredCouponReservations(env, {
  couponId = null,
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
      WHERE coupon_id IS NOT NULL
        AND (? IS NULL OR coupon_id = ?)
        AND (? IS NULL OR id != ?)
        AND coupon_applied_at IS NULL
        AND coupon_released_at IS NULL
        AND coupon_reservation_expires_at IS NOT NULL
        AND coupon_reservation_expires_at <= ?
    `)
    .bind(couponId, couponId, excludeOrderId, excludeOrderId, now)
    .all();

  let settled = 0;

  for (const order of result?.results || []) {
    const changed = await releaseReservedCoupon(database, order, now);
    if (changed) {
      settled += 1;
    }
  }

  return settled;
}

export async function prepareCouponPricing(env, {
  userId = null,
  email = "",
  subtotalAmount = 0,
  couponCode = "",
} = {}) {
  const normalizedCode = normalizeCouponCode(couponCode);
  if (!normalizedCode) {
    return null;
  }

  const database = getDb(env);
  if (!database) {
    throw Object.assign(new Error("쿠폰 사용 주문은 주문 API 연결이 필요합니다. 잠시 후 다시 시도해주세요."), {
      status: 503,
    });
  }

  const now = new Date().toISOString();
  const existingCoupon = await findCouponByCode(database, normalizedCode);

  await settleExpiredCouponReservations(env, {
    couponId: existingCoupon?.id || null,
    now,
  });

  return resolveCouponForPricing(database, {
    couponCode: normalizedCode,
    userId,
    emailNormalized: normalizeEmail(email),
    subtotalAmount,
    now,
  });
}

export async function reserveCouponForOrder(env, order, createdAt = new Date().toISOString()) {
  if (!order?.couponCode) {
    return false;
  }

  const database = getDb(env);
  if (!database) {
    throw Object.assign(new Error("Coupon reservation requires a D1 binding."), {
      status: 503,
    });
  }

  const coupon = await resolveCouponForPricing(database, {
    couponCode: order.couponCode,
    userId: order.userId || null,
    emailNormalized: normalizeEmail(order.shipping?.email),
    subtotalAmount: order.subtotalAmount,
    now: createdAt,
  });

  if (!coupon || coupon.discountAmount !== roundAmount(order.couponDiscountAmount)) {
    throw Object.assign(new Error("쿠폰 조건이 변경되어 다시 적용이 필요합니다."), {
      status: 409,
    });
  }

  await database
    .prepare(`
      INSERT INTO coupon_redemptions (
        coupon_id,
        order_id,
        user_id,
        email_normalized,
        status,
        discount_amount,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'reserved', ?, ?, ?)
      ON CONFLICT(coupon_id, order_id) DO UPDATE SET
        user_id = excluded.user_id,
        email_normalized = excluded.email_normalized,
        status = 'reserved',
        discount_amount = excluded.discount_amount,
        updated_at = excluded.updated_at
    `)
    .bind(
      coupon.id,
      order.orderId,
      order.userId || null,
      normalizeEmail(order.shipping?.email),
      coupon.discountAmount,
      createdAt,
      createdAt,
    )
    .run();

  await database
    .prepare(`
      UPDATE orders
      SET coupon_id = ?,
          coupon_code = ?,
          coupon_title = ?,
          coupon_scope = ?,
          coupon_discount_type = ?,
          coupon_discount_value = ?,
          coupon_discount_amount = ?,
          coupon_reservation_expires_at = ?,
          coupon_reserved_at = COALESCE(coupon_reserved_at, ?),
          updated_at = ?
      WHERE id = ?
    `)
    .bind(
      coupon.id,
      coupon.code,
      coupon.title,
      coupon.scope,
      coupon.discountType,
      coupon.discountValue,
      coupon.discountAmount,
      coupon.reservationExpiresAt,
      createdAt,
      createdAt,
      order.orderId,
    )
    .run();

  return true;
}

export async function syncOrderCouponState(env, orderId, {
  now = new Date().toISOString(),
} = {}) {
  const database = getDb(env);
  if (!database || !orderId) {
    return false;
  }

  const order = await findOrderRecord(database, orderId);
  if (!order || !order.coupon_id) {
    return false;
  }

  if (isPaymentConfirmed(order)) {
    await captureReservedCoupon(database, order, now);
  }

  if (isPaymentReverted(order)) {
    await releaseReservedCoupon(database, order, now);
    return true;
  }

  const shipment = await findShipmentRecord(database, orderId);
  const shipmentStatus = String(shipment?.status || "").trim().toLowerCase();

  if (shipmentStatus === "returned") {
    await releaseReservedCoupon(database, order, now);
  }

  return true;
}

export async function readCoupons(env, { query = "", limit = 20 } = {}) {
  const database = getDb(env);
  if (!database) {
    return [];
  }

  await settleExpiredCouponReservations(env);

  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
  const safeQuery = String(query || "").trim().toLowerCase();
  const searchValue = `%${safeQuery}%`;

  const result = await database
    .prepare(`
      SELECT
        coupons.*,
        COALESCE(SUM(CASE WHEN coupon_redemptions.status IN ('reserved', 'applied') THEN 1 ELSE 0 END), 0) AS active_use_count,
        COALESCE(SUM(CASE WHEN coupon_redemptions.status = 'applied' THEN 1 ELSE 0 END), 0) AS applied_use_count
      FROM coupons
      LEFT JOIN coupon_redemptions ON coupon_redemptions.coupon_id = coupons.id
      WHERE (? = '' OR lower(coupons.code) LIKE ? OR lower(coupons.title) LIKE ? OR lower(coupons.email_normalized) LIKE ?)
      GROUP BY coupons.id
      ORDER BY coupons.created_at DESC
      LIMIT ?
    `)
    .bind(
      safeQuery,
      searchValue,
      searchValue,
      searchValue,
      safeLimit,
    )
    .all();

  return (result?.results || []).map(mapCouponRecord);
}

export async function upsertCoupon(env, input = {}) {
  const database = getDb(env);
  if (!database) {
    throw Object.assign(new Error("Coupon management requires a D1 binding."), {
      status: 503,
    });
  }

  await settleExpiredCouponReservations(env);

  const now = new Date().toISOString();
  const couponId = String(input.id || "").trim();
  const existing = couponId ? await findCouponById(database, couponId) : null;
  const scope = normalizeCouponScope(input.scope ?? existing?.scope ?? "targeted");
  const code = normalizeCouponCode(input.code || existing?.code || generateCouponCode(scope));
  const title = String(input.title || existing?.title || "").trim();
  const discountType = normalizeCouponDiscountType(input.discountType ?? existing?.discount_type ?? "fixed");
  const discountValue = roundAmount(input.discountValue ?? existing?.discount_value);
  const minimumOrderAmount = roundAmount(input.minimumOrderAmount ?? existing?.minimum_order_amount);
  const maximumDiscountAmountRaw = roundAmount(input.maximumDiscountAmount ?? existing?.maximum_discount_amount);
  const maximumDiscountAmount = maximumDiscountAmountRaw > 0 ? maximumDiscountAmountRaw : null;
  const usageLimit = normalizeUsageLimit(input.usageLimit ?? existing?.usage_limit, 1);
  const startsAt = normalizeTimestamp(input.startsAt ?? existing?.starts_at);
  const expiresAt = normalizeTimestamp(input.expiresAt ?? existing?.expires_at);
  const targetEmail = scope === "targeted"
    ? normalizeEmail(input.targetEmail ?? existing?.email_normalized ?? "")
    : "";
  let userId = scope === "targeted"
    ? String(input.userId ?? existing?.user_id ?? "").trim() || null
    : null;

  if (!title) {
    throw Object.assign(new Error("쿠폰 이름을 입력해주세요."), {
      status: 400,
    });
  }

  if (!code) {
    throw Object.assign(new Error("쿠폰 코드를 확인해주세요."), {
      status: 400,
    });
  }

  if (discountValue <= 0) {
    throw Object.assign(new Error("할인 값은 1보다 커야 합니다."), {
      status: 400,
    });
  }

  if (discountType === "percent" && (discountValue < 1 || discountValue > 50)) {
    throw Object.assign(new Error("정률 쿠폰은 1% 이상 50% 이하로 설정해주세요."), {
      status: 400,
    });
  }

  if (discountType === "fixed" && minimumOrderAmount > 0 && minimumOrderAmount <= discountValue) {
    throw Object.assign(new Error("정액 쿠폰의 최소 주문금액은 할인 금액보다 크게 설정해주세요."), {
      status: 400,
    });
  }

  if (startsAt && expiresAt && startsAt > expiresAt) {
    throw Object.assign(new Error("쿠폰 시작일은 만료일보다 이전이어야 합니다."), {
      status: 400,
    });
  }

  if (scope === "targeted" && !targetEmail && !userId) {
    throw Object.assign(new Error("지정 쿠폰은 대상 이메일 또는 계정이 필요합니다."), {
      status: 400,
    });
  }

  if (!userId && targetEmail) {
    userId = await resolveUserIdByEmail(database, targetEmail);
  }

  const duplicate = await findCouponByCode(database, code);
  if (duplicate && duplicate.id !== couponId) {
    throw Object.assign(new Error("이미 사용 중인 쿠폰 코드입니다."), {
      status: 409,
    });
  }

  const isActive = input.isActive === undefined
    ? Boolean(existing ? Number(existing.is_active) : true)
    : Boolean(input.isActive);

  if (existing) {
    await database
      .prepare(`
        UPDATE coupons
        SET code = ?,
            title = ?,
            scope = ?,
            user_id = ?,
            email_normalized = ?,
            discount_type = ?,
            discount_value = ?,
            minimum_order_amount = ?,
            maximum_discount_amount = ?,
            usage_limit = ?,
            starts_at = ?,
            expires_at = ?,
            is_active = ?,
            updated_at = ?
        WHERE id = ?
      `)
      .bind(
        code,
        title,
        scope,
        userId,
        targetEmail,
        discountType,
        discountValue,
        minimumOrderAmount,
        maximumDiscountAmount,
        usageLimit,
        startsAt,
        expiresAt,
        isActive ? 1 : 0,
        now,
        existing.id,
      )
      .run();

    return readCouponWithStatsById(database, existing.id);
  }

  const id = generateCouponId();

  await database
    .prepare(`
      INSERT INTO coupons (
        id,
        code,
        title,
        scope,
        user_id,
        email_normalized,
        discount_type,
        discount_value,
        minimum_order_amount,
        maximum_discount_amount,
        usage_limit,
        starts_at,
        expires_at,
        is_active,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      id,
      code,
      title,
      scope,
      userId,
      targetEmail,
      discountType,
      discountValue,
      minimumOrderAmount,
      maximumDiscountAmount,
      usageLimit,
      startsAt,
      expiresAt,
      isActive ? 1 : 0,
      now,
      now,
    )
    .run();

  return readCouponWithStatsById(database, id);
}