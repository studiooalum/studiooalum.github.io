import { generatePreviewPaymentKey, paymentConfirmSchema } from "@/lib/commerce";
import { canConfirmWithToss, confirmTossPayment } from "@/lib/toss";

function buildPreviewPayment(data) {
  return {
    orderId: data.orderId,
    orderName: data.orderName || data.orderId,
    amount: Math.round(data.amount),
    paymentKey: data.paymentKey || generatePreviewPaymentKey(),
    status: "confirmed",
    providerMode: process.env.TOSS_SECRET_KEY ? "server-secret-configured-preview" : "preview-confirmation",
    approvedAt: new Date().toISOString(),
  };
}

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

  if (canConfirmWithToss(parsed.data.paymentKey)) {
    try {
      const payment = await confirmTossPayment(parsed.data);
      return Response.json({ ok: true, payment });
    } catch (error) {
      return Response.json(
        {
          ok: false,
          message: error?.message || "Toss confirmation failed.",
          providerMode: "live-confirmation",
          details: error?.payload || null,
        },
        { status: error?.status || 502 }
      );
    }
  }

  const payment = buildPreviewPayment(parsed.data);

  return Response.json({ ok: true, payment });
}