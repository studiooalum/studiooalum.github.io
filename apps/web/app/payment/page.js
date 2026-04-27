"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/catalog";
import {
  clearCart,
  clearPendingOrder,
  readPendingOrder,
  setPaymentResult,
} from "@/lib/cart-storage";

export default function PaymentPage() {
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setOrder(readPendingOrder());
    setIsReady(true);
  }, []);

  async function handleConfirmPayment() {
    if (!order) return;

    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/payments/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: order.orderId,
          orderName: order.orderName,
          amount: order.amount,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        const message = payload?.message || "결제 승인에 실패했습니다.";
        router.push(`/fail?message=${encodeURIComponent(message)}`);
        return;
      }

      setPaymentResult(payload.payment);
      clearCart();
      clearPendingOrder();
      router.push(
        `/success?orderId=${encodeURIComponent(payload.payment.orderId)}&amount=${encodeURIComponent(String(payload.payment.amount))}&paymentKey=${encodeURIComponent(payload.payment.paymentKey)}`
      );
    } catch (confirmError) {
      console.error("Failed to confirm payment", confirmError);
      setError("결제 승인 요청 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isReady && !order) {
    return (
      <div className="page-stack">
        <section className="detail-hero">
          <div className="detail-copy">
            <p className="kicker">Payment</p>
            <h1>결제할 주문 정보가 없습니다.</h1>
            <p className="detail-note">체크아웃에서 주문을 먼저 생성한 뒤 이 단계로 이동해야 합니다.</p>
            <div className="action-row">
              <Link href="/checkout" className="action-pill action-pill--solid">
                Back to checkout
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="detail-hero">
        <div className="detail-copy">
          <p className="kicker">Payment</p>
          <h1>Confirm the order through the server route.</h1>
          <p className="detail-note">
            This step posts the canonical order payload to `/api/payments/confirm`. It is still a preview approval flow, but the client no longer skips the server boundary.
          </p>
        </div>
      </section>

      <section className="checkout-grid">
        <div className="checkout-card">
          <div className="detail-section__header">
            <p className="kicker">Pending order</p>
            <h2>{order?.orderName}</h2>
          </div>
          <div className="payment-summary">
            <div>
              <span>Order ID</span>
              <strong>{order?.orderId}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{formatPrice(order?.amount || 0)}</strong>
            </div>
            <div>
              <span>Shipping to</span>
              <strong>{order?.shipping?.name}</strong>
            </div>
          </div>
        </div>

        <div className="checkout-card">
          <div className="detail-section__header">
            <p className="kicker">Approval</p>
            <h2>Preview server confirmation</h2>
          </div>
          <p className="detail-note">
            Replace this preview confirm step with the real PG secret-key approval call when the provider backend is ready.
          </p>
          <div className="purchase-panel__actions">
            <Link href="/checkout" className="action-button action-button--ghost">
              Back
            </Link>
            <button type="button" className="action-button action-button--solid" onClick={handleConfirmPayment} disabled={isSubmitting || !order}>
              {isSubmitting ? "Confirming..." : "Confirm payment"}
            </button>
          </div>
          {error ? <p className="status-banner status-banner--error">{error}</p> : null}
        </div>
      </section>
    </div>
  );
}