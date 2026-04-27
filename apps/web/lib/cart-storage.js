const CART_KEY = "studiooalum_web_cart";
const PENDING_ORDER_KEY = "studiooalum_web_pending_order";
const PAYMENT_RESULT_KEY = "studiooalum_web_payment_result";

function isBrowser() {
  return typeof window !== "undefined";
}

function readStoredJson(key, fallbackValue) {
  if (!isBrowser()) return fallbackValue;

  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function writeStoredJson(key, value) {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function removeStoredValue(key) {
  if (!isBrowser()) return;
  window.localStorage.removeItem(key);
}

export function readCart() {
  return readStoredJson(CART_KEY, []);
}

export function setCart(items) {
  writeStoredJson(CART_KEY, items);
}

export function addCartItem(item) {
  const items = readCart();
  const existing = items.find((entry) => entry.lineId === item.lineId);

  if (existing) {
    existing.qty = Number(existing.qty || 0) + Math.max(1, Number(item.qty) || 1);
  } else {
    items.push({
      ...item,
      qty: Math.max(1, Number(item.qty) || 1),
    });
  }

  setCart(items);
  return items;
}

export function removeCartItem(lineId) {
  const items = readCart().filter((entry) => entry.lineId !== lineId);
  setCart(items);
  return items;
}

export function updateCartItemQty(lineId, delta) {
  const items = readCart();
  const item = items.find((entry) => entry.lineId === lineId);

  if (!item) return items;

  item.qty = Math.max(1, Number(item.qty || 1) + Number(delta || 0));
  setCart(items);
  return items;
}

export function clearCart() {
  removeStoredValue(CART_KEY);
}

export function readPendingOrder() {
  return readStoredJson(PENDING_ORDER_KEY, null);
}

export function setPendingOrder(order) {
  writeStoredJson(PENDING_ORDER_KEY, order);
}

export function clearPendingOrder() {
  removeStoredValue(PENDING_ORDER_KEY);
}

export function readPaymentResult() {
  return readStoredJson(PAYMENT_RESULT_KEY, null);
}

export function setPaymentResult(payment) {
  writeStoredJson(PAYMENT_RESULT_KEY, payment);
}

export function clearPaymentResult() {
  removeStoredValue(PAYMENT_RESULT_KEY);
}