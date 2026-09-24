import { z } from "zod";

const orderItemSchema = z.object({
  lineId: z.string().trim().min(1).max(160),
  _id: z.string().trim().max(160).optional(),
  title: z.string().trim().min(1).max(300),
  slug: z.string().trim().optional().default(""),
  editionLabel: z.string().trim().optional().default(""),
  price: z.coerce.number().finite().nonnegative(),
  qty: z.coerce.number().int().min(1).max(20),
}).passthrough();

const shippingSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(8).max(40),
  email: z.string().trim().email().max(200),
  zipcode: z.string().trim().min(1).max(20),
  address1: z.string().trim().min(1).max(300),
  address2: z.string().trim().max(300).optional().default(""),
  memo: z.string().trim().max(1000).optional().default(""),
});

export const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1).max(50),
  shipping: shippingSchema,
  saveAsDefaultAddress: z.boolean().optional().default(false),
  pointsUsed: z.coerce.number().int().nonnegative().optional().default(0),
  couponCode: z.string().trim().max(48).optional().default(""),
  total: z.coerce.number().finite().nonnegative().optional(),
  createdAt: z.string().trim().optional(),
});

export const paymentConfirmSchema = z.object({
  orderId: z.string().trim().min(6).max(100).regex(/^[A-Za-z0-9_-]+$/),
  orderName: z.string().trim().max(200).optional(),
  amount: z.number().int().positive().max(100000000),
  paymentKey: z.string().trim().min(1).max(200),
});

export function computeOrderAmount(items) {
  return items.reduce((sum, item) => {
    return sum + Math.round(Number(item.price) || 0) * Math.max(1, Number(item.qty) || 1);
  }, 0);
}

export async function resolveOrderItems(env, inputItems) {
  const parsed = z.array(orderItemSchema).min(1).max(50).safeParse(inputItems);
  if (!parsed.success) throw Object.assign(new Error("상품과 수량을 다시 확인해주세요."), { status: 400 });
  const identifiers = parsed.data.map((item) => item._id || item.lineId);
  if (new Set(identifiers).size !== identifiers.length) throw Object.assign(new Error("중복된 상품 항목이 있습니다."), { status: 400 });
  const project = String(env?.SANITY_PROJECT_ID || "9bsud0bl");
  const dataset = String(env?.SANITY_DATASET || "production");
  if (!/^[a-z0-9-]+$/.test(project) || !/^[a-zA-Z0-9_-]+$/.test(dataset)) throw Object.assign(new Error("상품 저장소 설정을 확인해주세요."), { status: 503 });
  const url = new URL(`https://${project}.api.sanity.io/v2023-01-01/data/query/${dataset}`);
  url.searchParams.set("query", '*[_type == "product" && !(_id in path("drafts.**")) && _id in $ids]{_id,title,price,discountRate,soldOut,slug,"image":images[0].asset->url}');
  url.searchParams.set("$ids", JSON.stringify(identifiers));
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload?.result)) throw Object.assign(new Error("상품 가격을 확인할 수 없습니다. 잠시 후 다시 시도해주세요."), { status: 503 });
  const products = new Map(payload.result.map((product) => [product._id, product]));
  return parsed.data.map((item, index) => {
    const product = products.get(identifiers[index]);
    if (!product || product.soldOut) throw Object.assign(new Error("판매가 종료되었거나 찾을 수 없는 상품이 있습니다."), { status: 409 });
    const basePrice = Number(product.price);
    const discount = Number(product.discountRate || 0);
    if (!Number.isSafeInteger(basePrice) || basePrice <= 0 || !Number.isFinite(discount) || discount < 0 || discount >= 100) {
      throw Object.assign(new Error("상품 가격 설정을 확인해야 합니다."), { status: 409 });
    }
    const price = Math.round(basePrice * (1 - discount / 100));
    if (price <= 0 || price * item.qty > 100000000) throw Object.assign(new Error("결제 가능한 상품 금액을 확인해주세요."), { status: 409 });
    return { lineId: product._id, productId: product._id, title: product.title, slug: product.slug?.current || "", editionLabel: "", image: product.image || null, price, qty: item.qty };
  });
}

export function buildOrderName(items) {
  if (!items?.length) return "주문 상품 없음";
  const firstTitle = items[0]?.title || "상품";
  if (items.length === 1) return firstTitle;
  return `${firstTitle} 외 ${items.length - 1}건`;
}

export function generateOrderId() {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomUUID().replace(/-/g, "");
  return `OALUM-CF-${timestamp}-${random}`.toUpperCase();
}
