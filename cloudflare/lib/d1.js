function getDb(env) {
  return env?.OALUM_DB || null;
}

export function hasD1(env) {
  return Boolean(getDb(env));
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
        order_name,
        status,
        payment_status,
        currency,
        total_amount,
        customer_name,
        customer_phone,
        customer_email,
        zipcode,
        address1,
        address2,
        memo,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      order.orderId,
      order.orderName,
      order.status || "pending",
      order.paymentStatus || "ready",
      "KRW",
      order.total,
      order.shipping.name,
      order.shipping.phone,
      order.shipping.email,
      order.shipping.zipcode,
      order.shipping.address1,
      order.shipping.address2 || "",
      order.shipping.memo || "",
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
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        order.orderId,
        item.lineId,
        item.productId,
        item.title,
        item.slug || "",
        item.editionLabel || null,
        item.price,
        item.qty,
        createdAt,
      ),
    );
  }

  await database.batch(statements);
  return true;
}

export async function persistPayment(env, payment) {
  const database = getDb(env);
  if (!database) return false;

  const normalizedStatus = String(payment.status || "DONE").toUpperCase();
  const orderStatus = normalizedStatus === "DONE" ? "paid" : "payment-pending";
  const paymentStatus = normalizedStatus === "DONE" ? "paid" : normalizedStatus.toLowerCase();
  const now = new Date().toISOString();

  await database.batch([
    database.prepare(`
      UPDATE orders
      SET status = ?,
          payment_status = ?,
          payment_key = ?,
          payment_method = ?,
          approved_at = ?,
          updated_at = ?
      WHERE id = ?
    `).bind(
      orderStatus,
      paymentStatus,
      payment.paymentKey || null,
      payment.method || null,
      payment.approvedAt || null,
      now,
      payment.orderId,
    ),
    database.prepare(`
      INSERT OR REPLACE INTO payments (
        order_id,
        payment_key,
        provider,
        provider_mode,
        method,
        status,
        amount,
        raw_response,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      payment.orderId,
      payment.paymentKey || null,
      payment.provider || "toss",
      payment.providerMode || "preview",
      payment.method || null,
      normalizedStatus,
      payment.amount,
      JSON.stringify(payment.rawResponse || null),
      now,
      now,
    ),
    database.prepare(`
      INSERT INTO payment_events (
        order_id,
        event_type,
        payload,
        created_at
      ) VALUES (?, ?, ?, ?)
    `).bind(
      payment.orderId,
      "payment.confirmed",
      JSON.stringify(payment.rawResponse || payment),
      now,
    ),
  ]);

  return true;
}

function inferOrderId(payload) {
  return payload?.orderId || payload?.data?.orderId || payload?.payment?.orderId || null;
}

function inferEventType(payload) {
  return payload?.eventType || payload?.type || payload?.status || "webhook.received";
}

export async function persistWebhookEvent(env, payload) {
  const database = getDb(env);
  if (!database) return false;

  await database.prepare(`
    INSERT INTO payment_events (
      order_id,
      event_type,
      payload,
      created_at
    ) VALUES (?, ?, ?, ?)
  `).bind(
    inferOrderId(payload),
    inferEventType(payload),
    JSON.stringify(payload || null),
    new Date().toISOString(),
  ).run();

  return true;
}