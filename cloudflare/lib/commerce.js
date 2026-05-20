import { z } from "zod";

const orderItemSchema = z.object({
  lineId: z.string().trim().min(1),
  _id: z.string().trim().optional(),
  title: z.string().trim().min(1),
  slug: z.string().trim().optional().default(""),
  editionLabel: z.string().trim().optional().default(""),
  price: z.coerce.number().finite().nonnegative(),
  qty: z.coerce.number().int().min(1).max(20),
}).passthrough();

const shippingSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  email: z.string().trim().email(),
  zipcode: z.string().trim().min(1),
  address1: z.string().trim().min(1),
  address2: z.string().trim().optional().default(""),
  memo: z.string().trim().optional().default(""),
});

export const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1),
  shipping: shippingSchema,
  saveAsDefaultAddress: z.boolean().optional().default(false),
  total: z.coerce.number().finite().nonnegative().optional(),
  createdAt: z.string().trim().optional(),
});

export const paymentConfirmSchema = z.object({
  orderId: z.string().trim().min(1),
  orderName: z.string().trim().optional(),
  amount: z.coerce.number().finite().positive(),
  paymentKey: z.string().trim().optional(),
});

export function normalizeOrderItems(items) {
  return items.map((item) => ({
    lineId: item.lineId,
    productId: item._id || null,
    title: item.title,
    slug: item.slug || "",
    editionLabel: item.editionLabel || "",
    image: item.image || null,
    price: Math.round(Number(item.price) || 0),
    qty: Math.max(1, Number(item.qty) || 1),
  }));
}

export function computeOrderAmount(items) {
  return items.reduce((sum, item) => {
    return sum + Math.round(Number(item.price) || 0) * Math.max(1, Number(item.qty) || 1);
  }, 0);
}

export function buildOrderName(items) {
  if (!items?.length) return "주문 상품 없음";
  const firstTitle = items[0]?.title || "상품";
  if (items.length === 1) return firstTitle;
  return `${firstTitle} 외 ${items.length - 1}건`;
}

export function generateOrderId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `OALUM-CF-${timestamp}-${random}`.toUpperCase();
}

export function buildPreviewPayment({ orderId, orderName, amount, paymentKey }) {
  return {
    provider: "toss",
    providerMode: "preview-no-secret",
    orderId,
    orderName: orderName || orderId,
    amount: Math.round(Number(amount) || 0),
    paymentKey: paymentKey || `preview_${Date.now().toString(36)}`,
    method: null,
    status: "DONE",
    approvedAt: new Date().toISOString(),
    rawResponse: null,
  };
}