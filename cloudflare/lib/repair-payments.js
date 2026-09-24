import { confirmTossPayment, getTossConfig, readTossPayment, cancelTossPayment } from "./toss.js";
import { buildRepairTicketUrl } from "./repair-tickets.js";
import { createNotificationOutboxStatement, prepareNotification, resolveNotificationAdminRecipient } from "./notifications.js";

function requireDb(env) {
  if (!env.OALUM_DB) throw Object.assign(new Error("결제 저장소가 준비되지 않았습니다."), { status: 503 });
  return env.OALUM_DB;
}

async function readRepair(database, repairId) {
  const repair = await database.prepare(`SELECT r.*, t.id AS ticket_id, t.short_code FROM repair_requests r
    JOIN repair_tickets t ON t.repair_id = r.id WHERE r.id = ?`).bind(repairId).first();
  if (!repair) throw Object.assign(new Error("수선 정보를 찾을 수 없습니다."), { status: 404 });
  return repair;
}

function assertPayable(repair) {
  if (repair.status !== "payment_pending" || repair.payment_confirmed_at || !Number.isSafeInteger(repair.final_amount) || repair.final_amount <= 0) {
    throw Object.assign(new Error("현재 결제 가능한 수선 내역이 아닙니다."), { status: 409 });
  }
}

export async function createRepairCheckout(env, repairId) {
  const database = requireDb(env);
  const repair = await readRepair(database, repairId);
  assertPayable(repair);
  const config = getTossConfig(env);
  if (!config.isClientReady) throw Object.assign(new Error("온라인 결제 설정이 준비되지 않았습니다."), { status: 503 });
  const now = new Date().toISOString();
  await database.prepare(`UPDATE repair_payment_orders SET status = 'cancelled', cancelled_at = ?, updated_at = ?
    WHERE repair_id = ? AND status = 'pending' AND (amount <> ? OR expires_at <= ?)`)
    .bind(now, now, repairId, repair.final_amount, now).run();
  await database.prepare(`INSERT OR IGNORE INTO repair_payment_orders (id, repair_id, amount, expires_at, created_at, updated_at)
    SELECT ?, id, final_amount, ?, ?, ? FROM repair_requests WHERE id = ? AND status = 'payment_pending' AND payment_confirmed_at IS NULL`)
    .bind(`RPO_${crypto.randomUUID().replace(/-/g, "")}`, new Date(Date.now() + 24 * 3600000).toISOString(), now, now, repairId).run();
  const order = await database.prepare("SELECT * FROM repair_payment_orders WHERE repair_id = ? AND status IN ('pending','processing','paid')").bind(repairId).first();
  if (!order || order.status !== "pending") throw Object.assign(new Error("처리 중인 결제 내역을 확인해주세요."), { status: 409 });
  return { orderId: order.id, amount: order.amount, currency: "KRW", orderName: `수선 ${repair.request_number}`, clientKey: config.clientKey,
    paymentVariantKey: env.TOSS_PAYMENT_VARIANT_KEY || "DEFAULT", agreementVariantKey: env.TOSS_AGREEMENT_VARIANT_KEY || "AGREEMENT",
    customer: { name: repair.customer_name, email: repair.email }, expiresAt: order.expires_at };
}

export async function settleRepairPayment(env, payment) {
  const database = requireDb(env);
  const order = await database.prepare("SELECT * FROM repair_payment_orders WHERE id = ?").bind(payment.orderId).first();
  if (!order || !payment.paymentKey || payment.amount !== order.amount || payment.status !== "DONE"
    || (order.payment_key && order.payment_key !== payment.paymentKey)) throw Object.assign(new Error("수선 결제 정보가 일치하지 않습니다."), { status: 409 });
  if (order.status === "paid") return { orderId: order.id, status: "paid", amount: order.amount };
  if (!["pending", "processing"].includes(order.status)) throw Object.assign(new Error("종료된 결제 요청입니다."), { status: 409 });
  const repair = await readRepair(database, order.repair_id);
  assertPayable(repair);
  if (repair.final_amount !== order.amount) throw Object.assign(new Error("최종 금액이 변경되었습니다. 결제 내역 확인이 필요합니다."), { status: 409 });
  const now = new Date().toISOString();
  const approvedAt = payment.approvedAt;
  const messageId = `RTM_${order.id}`;
  const payload = { customer_name: repair.customer_name, repair_number: repair.request_number,
    final_amount: `${order.amount.toLocaleString("ko-KR")}원`,
    repair_ticket_url: await buildRepairTicketUrl(env, { id: repair.ticket_id, shortCode: repair.short_code }),
    repair_admin_url: new URL(`/repair-ticket?ticket=${encodeURIComponent(repair.ticket_id)}&mode=admin`, env.PUBLIC_SITE_URL || "https://studiooalum.com").href };
  const notifications = await Promise.all([
    prepareNotification(env, { eventKey: `${order.id}:paid:customer`, entityType: "repair", entityId: repair.id, templateKey: "repair.payment_confirmed", channel: "email", recipient: repair.email, payload }),
    prepareNotification(env, { eventKey: `${order.id}:paid:admin`, entityType: "repair", entityId: repair.id, templateKey: "repair.payment_confirmed_admin", channel: "email", recipient: resolveNotificationAdminRecipient(env), payload }),
  ]);
  await database.batch([
    database.prepare("UPDATE repair_payment_orders SET status = 'paid', payment_key = ?, approved_at = ?, updated_at = ? WHERE id = ? AND status IN ('pending','processing')")
      .bind(payment.paymentKey, approvedAt, now, order.id),
    database.prepare("UPDATE repair_requests SET payment_confirmed_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND payment_confirmed_at IS NULL")
      .bind(approvedAt, now, repair.id),
    database.prepare("UPDATE repair_tickets SET unread_customer_count = unread_customer_count + 1, unread_admin_count = unread_admin_count + 1, last_message_at = ?, updated_at = ? WHERE id = ? AND NOT EXISTS (SELECT 1 FROM repair_ticket_messages WHERE id = ?)")
      .bind(now, now, repair.ticket_id, messageId),
    database.prepare(`INSERT OR IGNORE INTO repair_ticket_messages (id, ticket_id, client_message_id, author_type, body, message_hash, created_at)
      VALUES (?, ?, ?, 'system', ?, '', ?)`)
      .bind(messageId, repair.ticket_id, `payment:${order.id}`, `토스 결제 ${order.amount.toLocaleString("ko-KR")}원이 확인되었습니다. 제품 발송을 준비합니다.`, now),
    ...notifications.filter(Boolean).map((notification) => createNotificationOutboxStatement(database, notification, { ignoreDuplicate: true })),
  ]);
  return { orderId: order.id, status: "paid", amount: order.amount };
}

export async function confirmRepairPayment(env, repairId, input) {
  const database = requireDb(env);
  const order = await database.prepare("SELECT * FROM repair_payment_orders WHERE id = ? AND repair_id = ?").bind(input.orderId, repairId).first();
  if (!order || input.amount !== order.amount || (order.payment_key && order.payment_key !== input.paymentKey)) throw Object.assign(new Error("결제 주문 또는 금액이 일치하지 않습니다."), { status: 409 });
  if (order.status === "paid") return { orderId: order.id, status: "paid", amount: order.amount };
  const repair = await readRepair(database, repairId);
  assertPayable(repair);
  if (repair.final_amount !== order.amount || !["pending", "processing"].includes(order.status) || (order.status === "pending" && order.expires_at <= new Date().toISOString())) {
    throw Object.assign(new Error("결제 요청이 만료되었거나 금액이 변경되었습니다."), { status: 409 });
  }
  const claim = await database.prepare(`UPDATE repair_payment_orders SET status = 'processing', payment_key = ?, updated_at = ?
    WHERE id = ? AND status IN ('pending','processing') AND (payment_key IS NULL OR payment_key = ?)
      AND amount = (SELECT final_amount FROM repair_requests WHERE id = ? AND status = 'payment_pending' AND payment_confirmed_at IS NULL)`)
    .bind(input.paymentKey, new Date().toISOString(), order.id, input.paymentKey, repairId).run();
  if (!Number(claim.meta?.changes)) throw Object.assign(new Error("다른 결제 요청이 처리 중입니다."), { status: 409 });
  const payment = await confirmTossPayment(env, input);
  return settleRepairPayment(env, payment);
}

export async function reconcileRepairPayments(env) {
  const database = requireDb(env);
  const orders = await database.prepare("SELECT * FROM repair_payment_orders WHERE status = 'processing' ORDER BY updated_at LIMIT 15").all();
  for (const order of orders.results || []) {
    try {
      const payment = await readTossPayment(env, order.payment_key);
      if (payment.status === "DONE" && payment.currency === "KRW") await settleRepairPayment(env, { ...payment, amount: payment.totalAmount });
      else if (["ABORTED", "EXPIRED"].includes(payment.status)) {
        await database.prepare("UPDATE repair_payment_orders SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'processing'").bind(new Date().toISOString(), order.id).run();
      }
    } catch (error) { console.error("Repair payment reconciliation pending", { orderId: order.id, status: error.status }); }
  }
}

export async function refundRepairPayment(env, repairId, cancelReason) {
  const database = requireDb(env);
  const order = await database.prepare("SELECT * FROM repair_payment_orders WHERE repair_id = ? AND status = 'paid'").bind(repairId).first();
  if (!order) throw Object.assign(new Error("환불할 수선 결제를 찾을 수 없습니다."), { status: 409 });
  const repair = await readRepair(database, repairId);
  if (["shipping", "closed"].includes(repair.status)) throw Object.assign(new Error("발송된 수선은 반품 처리 후 환불해주세요."), { status: 409 });
  const result = await cancelTossPayment(env, { paymentKey: order.payment_key, orderId: order.id, amount: order.amount, cancelReason });
  const now = new Date().toISOString();
  await database.batch([
    database.prepare("UPDATE repair_payment_orders SET status = 'refunded', cancelled_at = ?, updated_at = ? WHERE id = ?").bind(result.cancelledAt, now, order.id),
    database.prepare("UPDATE repair_requests SET payment_confirmed_at = NULL, status = 'cancelled', version = version + 1, updated_at = ? WHERE id = ?").bind(now, repairId),
  ]);
  return { status: "refunded", orderId: order.id };
}