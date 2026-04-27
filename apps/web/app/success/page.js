import Link from "next/link";
import { formatPrice } from "@/lib/catalog";

export default async function SuccessPage({ searchParams }) {
  const params = await searchParams;
  const amount = Number(params?.amount || 0);

  return (
    <div className="page-stack">
      <section className="detail-hero">
        <div className="detail-copy">
          <p className="kicker">Payment success</p>
          <h1>Order confirmation completed.</h1>
          <p className="detail-note">The payment confirmation route returned a successful preview response.</p>
        </div>
      </section>

      <section className="checkout-grid">
        <div className="checkout-card">
          <div className="payment-summary">
            <div>
              <span>Order ID</span>
              <strong>{params?.orderId || "—"}</strong>
            </div>
            <div>
              <span>Amount</span>
              <strong>{formatPrice(amount)}</strong>
            </div>
            <div>
              <span>Payment key</span>
              <strong>{params?.paymentKey || "—"}</strong>
            </div>
          </div>
        </div>
        <div className="checkout-card">
          <div className="purchase-panel__actions">
            <Link href="/shop" className="action-button action-button--ghost">
              Back to shop
            </Link>
            <Link href="/checkout" className="action-button action-button--solid">
              Create another order
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}