import { z } from "zod";

const orderItemSchema = z.object({
  lineId: z.string().min(1),
  productId: z.string().min(1).optional(),
  title: z.string().min(1),
  slug: z.string().optional(),
  editionLabel: z.string().optional(),
  imageUrl: z.union([z.string().url(), z.literal("")]).optional(),
  price: z.number().finite().nonnegative(),
  qty: z.number().int().min(1).max(20),
});

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
});

export const paymentConfirmSchema = z.object({
  orderId: z.string().trim().min(1),
  orderName: z.string().trim().optional(),
  amount: z.number().finite().positive(),
  paymentKey: z.string().trim().optional(),
});

export function computeOrderAmount(items) {
  return items.reduce((sum, item) => sum + Math.round(Number(item.price) || 0) * Math.max(1, Number(item.qty) || 1), 0);
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
  return `OALUM-WEB-${timestamp}-${random}`.toUpperCase();
}

export function generatePreviewPaymentKey() {
  return `preview_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}