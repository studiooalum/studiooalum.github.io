import { generatePreviewPaymentKey, paymentConfirmSchema } from "@/lib/commerce";

export async function POST(request) {
  const payload = await request.json().catch(() => null);
  const parsed = paymentConfirmSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        message: "Invalid payment confirmation payload.",
        issues: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const payment = {
    orderId: parsed.data.orderId,
    orderName: parsed.data.orderName || parsed.data.orderId,
    amount: Math.round(parsed.data.amount),
    paymentKey: parsed.data.paymentKey || generatePreviewPaymentKey(),
    status: "confirmed",
    providerMode: process.env.TOSS_SECRET_KEY ? "server-secret-configured-preview" : "preview-confirmation",
    approvedAt: new Date().toISOString(),
  };

  return Response.json({ ok: true, payment });
}