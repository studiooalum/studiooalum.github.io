"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/catalog";
import {
  clearPaymentResult,
  readCart,
  removeCartItem,
  setPendingOrder,
  updateCartItemQty,
} from "@/lib/cart-storage";

const initialForm = {
  name: "",
  phone: "",
  email: "",
  zipcode: "",
  address1: "",
  address2: "",
  memo: "",
};

export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [shipping, setShipping] = useState(initialForm);
  const [error, setError] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    clearPaymentResult();
    setItems(readCart());
    setIsReady(true);
  }, []);

  const amount = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);

  function syncCart() {
    setItems(readCart());
  }

  function handleQuantity(lineId, delta) {
    updateCartItemQty(lineId, delta);
    syncCart();
  }

  function handleRemove(lineId) {
    removeCartItem(lineId);
    syncCart();
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setShipping((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items,
          shipping,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        setError(payload?.message || "주문 생성에 실패했습니다.");
        return;
      }

      setPendingOrder(payload.order);
      router.push("/payment");
    } catch (submitError) {
      console.error("Failed to create order", submitError);
      setError("주문 생성 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isReady && items.length === 0) {
    return (
      <div className="page-stack">
        <section className="detail-hero">
          <div className="detail-copy">
            <p className="kicker">Checkout</p>
            <h1>장바구니가 비어 있습니다.</h1>
            <p className="detail-note">에디션 상세에서 상품을 담은 뒤 다시 체크아웃으로 오면 됩니다.</p>
            <div className="action-row">
              <Link href="/shop" className="action-pill action-pill--solid">
                Back to shop
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
          <p className="kicker">Checkout</p>
          <h1>Create the order record before payment.</h1>
          <p className="detail-note">
            This page now posts the cart and shipping payload to `/api/orders`, then hands the canonical order object to the payment step.
          </p>
        </div>
      </section>

      <section className="checkout-grid">
        <div className="checkout-card">
          <div className="detail-section__header">
            <p className="kicker">Cart summary</p>
            <h2>{items.length} items ready for order creation</h2>
          </div>
          <div className="checkout-list">
            {items.map((item) => (
              <article key={item.lineId} className="checkout-item">
                <div className="checkout-item__body">
                  <p className="eyebrow">{item.editionLabel || "Edition"}</p>
                  <h3>{item.title}</h3>
                  <p>{formatPrice(item.price)}</p>
                </div>
                <div className="checkout-item__actions">
                  <div className="quantity-control">
                    <button type="button" onClick={() => handleQuantity(item.lineId, -1)}>
                      −
                    </button>
                    <span>{item.qty}</span>
                    <button type="button" onClick={() => handleQuantity(item.lineId, 1)}>
                      +
                    </button>
                  </div>
                  <button type="button" className="text-button" onClick={() => handleRemove(item.lineId)}>
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="checkout-card">
          <div className="detail-section__header">
            <p className="kicker">Shipping</p>
            <h2>Submit customer details</h2>
          </div>
          <form className="checkout-form" onSubmit={handleSubmit}>
            <div className="form-grid">
              <label className="form-field">
                <span>Name</span>
                <input name="name" value={shipping.name} onChange={handleChange} required />
              </label>
              <label className="form-field">
                <span>Phone</span>
                <input name="phone" value={shipping.phone} onChange={handleChange} required />
              </label>
              <label className="form-field">
                <span>Email</span>
                <input name="email" type="email" value={shipping.email} onChange={handleChange} required />
              </label>
              <label className="form-field">
                <span>Zipcode</span>
                <input name="zipcode" value={shipping.zipcode} onChange={handleChange} required />
              </label>
              <label className="form-field form-field--wide">
                <span>Address 1</span>
                <input name="address1" value={shipping.address1} onChange={handleChange} required />
              </label>
              <label className="form-field form-field--wide">
                <span>Address 2</span>
                <input name="address2" value={shipping.address2} onChange={handleChange} />
              </label>
              <label className="form-field form-field--wide">
                <span>Memo</span>
                <textarea name="memo" value={shipping.memo} onChange={handleChange} rows="3" />
              </label>
            </div>

            <div className="checkout-summary">
              <div>
                <span>Total</span>
                <strong>{formatPrice(amount)}</strong>
              </div>
              <button type="submit" className="action-button action-button--solid" disabled={isSubmitting || items.length === 0}>
                {isSubmitting ? "Creating order..." : "Create order"}
              </button>
            </div>
            {error ? <p className="status-banner status-banner--error">{error}</p> : null}
          </form>
        </div>
      </section>
    </div>
  );
}