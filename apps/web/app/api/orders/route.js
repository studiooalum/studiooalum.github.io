import {
  buildOrderName,
  computeOrderAmount,
  createOrderSchema,
  generateOrderId,
} from "@/lib/commerce";

export async function POST(request) {
  const payload = await request.json().catch(() => null);
  const parsed = createOrderSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        message: "Invalid order payload.",
        issues: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const items = parsed.data.items.map((item) => ({
    ...item,
    price: Math.round(Number(item.price) || 0),
    qty: Math.max(1, Number(item.qty) || 1),
  }));
  const amount = computeOrderAmount(items);

  if (amount <= 0) {
    return Response.json(
      {
        ok: false,
        message: "Order amount must be greater than zero.",
      },
      { status: 400 }
    );
  }

  const order = {
    orderId: generateOrderId(),
    orderName: buildOrderName(items),
    amount,
    currency: "KRW",
    status: "created",
    createdAt: new Date().toISOString(),
    previewMode: true,
    items,
    shipping: parsed.data.shipping,
  };

  return Response.json(
    {
      ok: true,
      order,
    },
    { status: 201 }
  );
}